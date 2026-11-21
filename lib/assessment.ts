"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { analyze } from "./agents/metrics-agent";
import { getTodaysQuestions } from "./agents/question-agent";
import { draftRequest, type RequestDraft } from "./agents/request-agent";
import { mentionsWoundOrInfection } from "./agents/safety";
import { summarizeCase } from "./agents/summary";
import { isSignedIn } from "./auth";
import { today } from "./dates";
import { getEntries, getQuestionSets, imagePrefix, saveEntry } from "./entries";
import { METRICS, clampScore, combine, emptyScores, type Scores } from "./metrics";
import { recordMetrics } from "./metrics-csv";
import { PATIENTS } from "./patients";
import { saveRequest, type CheckupRequest } from "./requests";
import { getSuggestions, type SuggestionSet } from "./suggestions";
import { putObject } from "./storage";
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
  analyzedBy: "claude" | "dummy";
};

export type AnalyzeResult =
  | { status: "analyzed"; analysis: Analysis; concern: boolean }
  | { status: "nothing"; message: string }
  | { status: "error"; message: string };

export type CommitResult =
  | { status: "saved"; entry: Entry; concern: boolean }
  | { status: "nothing"; message: string }
  | { status: "error"; message: string };

const NOTHING =
  "I could not read anything about itching, comfort or moving about in that, so nothing was saved. Say a little about how it has been, in your own words.";

const readFiles = (formData: FormData) =>
  formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_IMAGES);

const hasAny = (scores: Scores) => METRICS.some((m) => scores[m.key] !== null);

/**
 * Step one of a check-in: the metrics agent reads the entry. Nothing is
 * stored. An entry from which no measure can be read is turned away here and
 * again in commitCheckin, so an empty one never reaches the record.
 */
export async function analyzeCheckin(formData: FormData): Promise<AnalyzeResult> {
  if (!(await isSignedIn("patient"))) return signedOut;
  const text = String(formData.get("text") ?? "").trim();
  const files = readFiles(formData);
  if (!text && files.length === 0) return { status: "nothing", message: NOTHING };
  try {
    const images = await Promise.all(
      files.map(async (file) => ({
        data: Buffer.from(await file.arrayBuffer()),
        mediaType: file.type || "image/jpeg",
      })),
    );
    const date = today();
    const questions =
      (await getQuestionSets(patientId)).filter((set) => set.date === date).pop()?.questions ?? [];
    const analysis = await analyze({ patientId, date, text, images, questions, followUp: null, noFollowUp: true });
    if (!hasAny(analysis.scores)) return { status: "nothing", message: NOTHING };
    return {
      status: "analyzed",
      analysis: { scores: analysis.scores, rationale: analysis.rationale, analyzedBy: analysis.analyzedBy },
      concern: mentionsWoundOrInfection(text),
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

/** Step two: what the agent read is written to the record, together with the words and pictures. */
export async function commitCheckin(formData: FormData): Promise<CommitResult> {
  if (!(await isSignedIn("patient"))) return signedOut;
  const text = String(formData.get("text") ?? "").trim();
  let analysis: Analysis;
  try {
    const parsed = z
      .object({ scores: scoresSchema, rationale: z.string(), analyzedBy: z.enum(["claude", "dummy"]) })
      .parse(JSON.parse(String(formData.get("analysis") ?? "")));
    analysis = { ...parsed, scores: toScores(parsed.scores) };
  } catch {
    return { status: "error", message: "That check-in could not be read back. Try again." };
  }
  // The rule that an entry which says nothing is never saved lives here, not in the screen.
  if (!hasAny(analysis.scores)) return { status: "nothing", message: NOTHING };

  try {
    const date = today();
    const id = randomUUID().slice(0, 8);
    const imageKeys = await Promise.all(
      readFiles(formData).map(async (file, i) => {
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
      images: imageKeys,
      scores: analysis.scores,
      combined: combine(analysis.scores),
      rationale: analysis.rationale,
      questions,
      followUp: null,
      analyzedBy: analysis.analyzedBy,
      caseSummary: null,
      safetyFlag: concern || undefined,
    };
    await saveEntry(entry);
    await recordMetrics(patientId, date, entry.scores);

    // The clinician's case summary is written after the patient has her
    // answer, so she never waits for it.
    after(async () => {
      try {
        const history = (await getEntries(patientId)).filter((e) => e.date !== date);
        const caseSummary = await summarizeCase([...history, entry]);
        await saveEntry({ ...entry, id: `${id}-summary`, createdAt: new Date().toISOString(), caseSummary });
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

/** The patient's own correction of what was recorded. Only the measures she changes move. */
export async function correctEntry(
  date: string,
  raw: z.infer<typeof scoresSchema>,
): Promise<{ status: "saved"; scores: Scores; combined: number | null } | { status: "error"; message: string }> {
  if (!(await isSignedIn("patient"))) return signedOut;
  const parsed = scoresSchema.safeParse(raw);
  if (!parsed.success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { status: "error", message: "That correction could not be saved." };
  }
  const scores = toScores(parsed.data);
  if (!hasAny(scores)) return { status: "error", message: "At least one measure has to stay." };
  try {
    const entry = (await getEntries(patientId)).find((e) => e.date === date && e.analyzedBy !== "seed");
    if (!entry) return { status: "error", message: "There is no check-in from that day to correct." };
    await recordMetrics(patientId, date, scores);
    await saveEntry({
      ...entry,
      id: `${entry.id.replace(/-summary$/, "")}-fix`,
      createdAt: new Date().toISOString(),
      scores,
      combined: combine(scores),
      corrected: true,
    });
    revalidatePath("/patient", "layout");
    return { status: "saved", scores, combined: combine(scores) };
  } catch (error) {
    console.error("Saving the correction failed", error);
    return { status: "error", message: "Something went wrong while saving the correction." };
  }
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
