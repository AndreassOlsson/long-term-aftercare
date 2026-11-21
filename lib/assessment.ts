"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { analyze } from "./agents/metrics-agent";
import { askAboutToday, closeToday, type Closing, type DayJudgement, type Exchange } from "./agents/reflect-agent";
import { getTodaysQuestions } from "./agents/question-agent";
import { draftRequest, type RequestDraft } from "./agents/request-agent";
import { mentionsWoundOrInfection } from "./agents/safety";
import { summarizeCase } from "./agents/summary";
import { isSignedIn } from "./auth";
import { today } from "./dates";
import { deleteEntryFiles, getEntries, getQuestionSets, imagePrefix, saveEntry } from "./entries";
import { METRICS, clampScore, cleanOwnScores, combine, emptyScores, ownKeys, scoredEverything, type MetricKey, type Scores } from "./metrics";
import { recordMetrics, removeMetrics } from "./metrics-csv";
import { PATIENTS } from "./patients";
import { listRequests, saveRequest, type CheckupRequest } from "./requests";
import { getSuggestions, type SuggestionSet } from "./suggestions";
import { deleteObject, getObject, putObject } from "./storage";
import type { Entry, QuestionSet } from "./types";

// What the patient's screens ask the server to do. Every action checks the
// login first and works on the one mock patient.

const MAX_IMAGES = 3;
const patientId = PATIENTS[0].id;

const signedOut = { status: "error" as const, message: "You are logged out. Log in again and try once more." };

// ---------------------------------------------------------------- questions

/** Today's targeted questions for the patient who is logged in; prepared on first ask. */
export async function todaysQuestions(): Promise<QuestionSet | null> {
  if (!(await isSignedIn("patient"))) return null;
  try {
    return await getTodaysQuestions(patientId, today());
  } catch (error) {
    console.error("Preparing today's questions failed", error);
    return null;
  }
}

// ----------------------------------------------------------------- check-in

export type Analysis = {
  scores: Scores;
  rationale: string;
  analyzedBy: "claude" | "dummy" | "patient";
};

export type AnalyzeResult =
  | { status: "analyzed"; analysis: Analysis; concern: boolean }
  | { status: "nothing"; message: string }
  | { status: "error"; message: string };

export type CommitResult =
  | { status: "saved"; entry: Entry; concern: boolean }
  | { status: "nothing"; message: string }
  | { status: "error"; message: string };

export type RemoveResult = { status: "removed" } | { status: "error"; message: string };

const NOTHING =
  "I could not read anything about itching, comfort or moving about in that, so nothing was saved. Say a little about how it has been, in your own words, or pick a score yourself.";
const EMPTY = "Nothing was saved. Pick a score, write something or add a picture first.";

const hasAny = (scores: Scores) => METRICS.some((m) => scores[m.key] !== null);

/** The scores she picked: score_<measure> fields, whole numbers 1 to 5, anything else ignored. */
function readOwnScores(formData: FormData): Partial<Scores> {
  const raw: Partial<Record<MetricKey, unknown>> = {};
  for (const m of METRICS) {
    const field = String(formData.get(`score_${m.key}`) ?? "").trim();
    if (field) raw[m.key] = Number(field);
  }
  return cleanOwnScores(raw);
}

/** Today's own entry, if she has checked in today (the made-up history never counts). */
async function todaysEntry(): Promise<Entry | null> {
  const date = today();
  return (await getEntries(patientId)).find((e) => e.date === date && e.analyzedBy !== "seed") ?? null;
}

/**
 * The pictures of this save. A saved picture can only be kept when it is in
 * today's own entry, so a key from another day (or another patient) is
 * dropped; new files fill what is left of the three places.
 */
function readPictures(formData: FormData, existing: Entry | null) {
  const keep = [...new Set(formData.getAll("keepImages").map(String))]
    .filter((key) => existing?.images.includes(key))
    .slice(0, MAX_IMAGES);
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_IMAGES - keep.length);
  return { keep, files };
}

/**
 * Step one of a check-in: the metrics agent reads the entry, told which
 * measures she scored herself. Nothing is stored. An entry from which no
 * measure can be read is turned away here and again in commitCheckin, so an
 * empty one never reaches the record. When there is nothing for the analysis
 * to read (scores alone) or nothing left for it to fill in (she scored
 * everything), it is not run at all.
 */
export async function analyzeCheckin(formData: FormData): Promise<AnalyzeResult> {
  if (!(await isSignedIn("patient"))) return signedOut;
  const text = String(formData.get("text") ?? "").trim();
  const own = readOwnScores(formData);
  try {
    const { keep, files } = readPictures(formData, await todaysEntry());
    const hasPictures = keep.length + files.length > 0;
    if (!text && !hasPictures && ownKeys(own).length === 0) return { status: "nothing", message: EMPTY };
    const concern = mentionsWoundOrInfection(text);
    if ((!text && !hasPictures) || scoredEverything(own)) {
      const scores = emptyScores();
      for (const key of ownKeys(own)) scores[key] = own[key] ?? null;
      return { status: "analyzed", analysis: { scores, rationale: "Scored by the patient.", analyzedBy: "patient" }, concern };
    }
    const kept = await Promise.all(
      keep.map(async (key) => {
        const object = await getObject(key);
        return object ? { data: object.body, mediaType: object.contentType } : null;
      }),
    );
    const added = await Promise.all(
      files.map(async (file) => ({ data: Buffer.from(await file.arrayBuffer()), mediaType: file.type || "image/jpeg" })),
    );
    const images = [...kept.filter((image) => image !== null), ...added];
    const date = today();
    const questions =
      (await getQuestionSets(patientId)).filter((set) => set.date === date).pop()?.questions ?? [];
    const analysis = await analyze({ patientId, date, text, images, questions, followUp: null, noFollowUp: true, ownScores: own });
    if (!hasAny(analysis.scores)) return { status: "nothing", message: NOTHING };
    return {
      status: "analyzed",
      analysis: { scores: analysis.scores, rationale: analysis.rationale, analyzedBy: analysis.analyzedBy },
      concern,
    };
  } catch (error) {
    console.error("Reading the check-in failed", error);
    return { status: "error", message: "Something went wrong while reading that. Your words are still here; try again." };
  }
}

const scoresSchema = z.object({
  itchiness: z.number().nullable(),
  comfort: z.number().nullable(),
  mobility: z.number().nullable(),
});

const toScores = (raw: z.infer<typeof scoresSchema>): Scores => {
  const scores = emptyScores();
  for (const m of METRICS) scores[m.key] = clampScore(raw[m.key]);
  return scores;
};

// ------------------------------------------------- the answer to a bad day

const reflectSchema = z.object({
  text: z.string().max(10_000),
  scores: scoresSchema,
  imageCount: z.number().int().min(0).max(MAX_IMAGES),
  question: z.string().max(2000).nullable().optional(),
  answer: z.string().max(4000).optional(),
});

type ReflectInput = z.input<typeof reflectSchema>;

export type AskResult =
  | { status: "ok"; judgement: DayJudgement; exchange: Exchange }
  | { status: "error"; message: string };
export type CloseResult = { status: "ok"; closing: Closing } | { status: "error"; message: string };

/**
 * After the entry and the picture are in and before anything is saved: today in
 * the light of the days before. On a bad day that follows bad days, one question.
 * Nothing is stored.
 */
export async function reflectOnCheckin(input: ReflectInput): Promise<AskResult> {
  if (!(await isSignedIn("patient"))) return signedOut;
  const parsed = reflectSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "That check-in could not be read back. Try again." };
  try {
    const { text, scores, imageCount } = parsed.data;
    const result = await askAboutToday(patientId, today(), { text, scores: toScores(scores), imageCount }, mentionsWoundOrInfection(text));
    return { status: "ok", ...result };
  } catch (error) {
    console.error("Reflecting on the check-in failed", error);
    return { status: "error", message: "Something went wrong. Your words are still here; try again." };
  }
}

/** Her answer taken, the close: what will be entered and, when warranted, the recommendation. */
export async function closeCheckinExchange(input: ReflectInput): Promise<CloseResult> {
  if (!(await isSignedIn("patient"))) return signedOut;
  const parsed = reflectSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "That check-in could not be read back. Try again." };
  try {
    const { text, scores, imageCount, question, answer } = parsed.data;
    const closing = await closeToday(patientId, today(), { text, scores: toScores(scores), imageCount }, mentionsWoundOrInfection(text), { question: question ?? null, answer: answer ?? "" });
    return { status: "ok", closing };
  } catch (error) {
    console.error("Closing the check-in failed", error);
    return { status: "error", message: "Something went wrong. Your words are still here; try again." };
  }
}

/**
 * Step two: what the agent read is written to the record, together with the
 * words, the pictures and which scores were her own. Her own scores are put
 * over whatever came back from the first step, so they stand exactly as
 * picked. Saving again on the same day replaces today's entry.
 */
export async function commitCheckin(formData: FormData): Promise<CommitResult> {
  if (!(await isSignedIn("patient"))) return signedOut;
  const text = String(formData.get("text") ?? "").trim();
  const own = readOwnScores(formData);
  // The one question asked on a bad day and her answer to it, kept with the entry.
  const followUpQuestion = String(formData.get("followUpQuestion") ?? "").trim().slice(0, 2000);
  const followUpAnswer = String(formData.get("followUpAnswer") ?? "").trim().slice(0, 4000);
  let analysis: Analysis;
  try {
    const parsed = z
      .object({ scores: scoresSchema, rationale: z.string(), analyzedBy: z.enum(["claude", "dummy", "patient"]) })
      .parse(JSON.parse(String(formData.get("analysis") ?? "")));
    analysis = { ...parsed, scores: toScores(parsed.scores) };
  } catch {
    return { status: "error", message: "That check-in could not be read back. Try again." };
  }
  for (const key of ownKeys(own)) analysis.scores[key] = own[key] ?? null;
  // The rule that an entry which says nothing is never saved lives here, not in the screen.
  if (!hasAny(analysis.scores)) return { status: "nothing", message: NOTHING };

  try {
    const date = today();
    const id = randomUUID().slice(0, 8);
    const existing = await todaysEntry();
    const { keep, files } = readPictures(formData, existing);
    const added = await Promise.all(
      files.map(async (file, i) => {
        const key = `${imagePrefix(patientId)}${id}-${i}.jpg`;
        await putObject(key, Buffer.from(await file.arrayBuffer()), file.type || "image/jpeg");
        return key;
      }),
    );
    const questions =
      (await getQuestionSets(patientId)).filter((set) => set.date === date).pop()?.questions ?? [];
    const concern = mentionsWoundOrInfection(text);
    const entry: Entry = {
      id,
      patientId,
      date,
      createdAt: new Date().toISOString(),
      text,
      images: [...keep, ...added],
      scores: analysis.scores,
      combined: combine(analysis.scores),
      rationale: analysis.rationale,
      ownScores: ownKeys(own).length ? own : undefined,
      questions,
      followUp: followUpQuestion ? { question: followUpQuestion, answer: followUpAnswer || null } : null,
      analyzedBy: analysis.analyzedBy,
      caseSummary: null,
      safetyFlag: concern || undefined,
    };
    await saveEntry(entry);
    await recordMetrics(patientId, date, entry.scores);
    if (existing) {
      // The old version of today goes; so do the pictures she took out.
      await deleteEntryFiles(patientId, date, `${date}-${id}.json`);
      await deleteUnusedPictures(existing.images.filter((key) => !entry.images.includes(key)));
    }

    // The clinician's case summary is written after the patient has her
    // answer, so she never waits for it.
    after(async () => {
      try {
        const all = await getEntries(patientId);
        // A correction or a removal made while this was being written wins.
        if (all.find((e) => e.date === date && e.analyzedBy !== "seed")?.id.replace(/-summary$/, "") !== id) return;
        const caseSummary = await summarizeCase(all);
        // Same createdAt as the entry it completes, so it never overtakes a later save.
        await saveEntry({ ...entry, id: `${id}-summary`, caseSummary });
      } catch (error) {
        console.error("Writing the case summary failed", error);
      }
    });
    revalidatePath("/patient", "layout");
    return { status: "saved", entry, concern };
  } catch (error) {
    console.error("Saving the check-in failed", error);
    return { status: "error", message: "Something went wrong while saving. Try again." };
  }
}

/** Takes today's check-in out of the record and the graphs, as if she had not checked in. */
export async function removeTodaysCheckin(): Promise<RemoveResult> {
  if (!(await isSignedIn("patient"))) return signedOut;
  try {
    const existing = await todaysEntry();
    if (!existing) return { status: "error", message: "There is no check-in from today to remove." };
    await removeMetrics(patientId, existing.date);
    await deleteEntryFiles(patientId, existing.date);
    await deleteUnusedPictures(existing.images);
    revalidatePath("/patient", "layout");
    return { status: "removed" };
  } catch (error) {
    console.error("Removing the check-in failed", error);
    return { status: "error", message: "Something went wrong while removing it. Try again." };
  }
}

/** Pictures nothing refers to any more go; one a sent request carries stays. */
async function deleteUnusedPictures(keys: string[]) {
  if (keys.length === 0) return;
  const used = new Set((await listRequests(patientId)).flatMap((r) => r.images));
  await Promise.all(keys.filter((key) => !used.has(key)).map((key) => deleteObject(key)));
}

// -------------------------------------------------------------- suggestions

export async function loadSuggestions(): Promise<SuggestionSet | null> {
  if (!(await isSignedIn("patient"))) return null;
  try {
    return await getSuggestions(patientId);
  } catch (error) {
    console.error("Preparing suggestions failed", error);
    return null;
  }
}

// ----------------------------------------------------------------- check-up

export async function draftCheckup(): Promise<RequestDraft | null> {
  if (!(await isSignedIn("patient"))) return null;
  try {
    return await draftRequest(patientId, today());
  } catch (error) {
    console.error("Preparing the request failed", error);
    return null;
  }
}

const sendSchema = z.object({
  headline: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(6000),
  evidenceDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(20),
  images: z.array(z.string()).max(3),
  raisedBy: z.enum(["patient", "suggested"]),
});

/** The patient sends the request she has read and edited, through the shared contract. */
export async function sendCheckup(
  input: z.input<typeof sendSchema>,
): Promise<{ status: "sent"; id: string } | { status: "error"; message: string }> {
  if (!(await isSignedIn("patient"))) return signedOut;
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Add a few words about what you want the clinic to know before sending." };
  const own = `patients/${patientId}/images/`;
  const images = parsed.data.images.filter((key) => key.startsWith(own) && !key.includes(".."));
  const now = new Date().toISOString();
  const request: CheckupRequest = {
    id: randomUUID().slice(0, 8),
    patientId,
    createdAt: now,
    updatedAt: now,
    status: "sent",
    headline: parsed.data.headline,
    body: parsed.data.body,
    evidenceDates: [...new Set(parsed.data.evidenceDates)].sort(),
    images,
    raisedBy: parsed.data.raisedBy,
    reply: null,
  };
  try {
    const saved = await saveRequest(request);
    revalidatePath("/patient", "layout");
    return { status: "sent", id: saved.id };
  } catch (error) {
    console.error("Sending the request failed", error);
    return { status: "error", message: "The request did not go through. Nothing was sent; try again." };
  }
}
