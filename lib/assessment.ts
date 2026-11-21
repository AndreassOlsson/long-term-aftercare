"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { analyze } from "./agents/metrics-agent";
import { getTodaysQuestions } from "./agents/question-agent";
import { summarizeCase } from "./agents/summary";
import { isSignedIn } from "./auth";
import { today } from "./dates";
import { getEntries, getQuestionSets, imagePrefix, saveEntry } from "./entries";
import { combine } from "./metrics";
import { recordMetrics } from "./metrics-csv";
import { PATIENTS } from "./patients";
import { putObject } from "./storage";
import type { Entry, QuestionSet } from "./types";

export type SubmitResult =
  | { status: "followup"; question: string }
  | { status: "saved"; entry: Entry }
  | { status: "error"; message: string };

const MAX_IMAGES = 3;

/**
 * The patient's "done" button. First pass: analyze, and if something is
 * missing return a follow-up question without saving. Second pass (the form
 * comes back with the question and an answer, or with skip): analyze again
 * and save.
 */
export async function submitAssessment(formData: FormData): Promise<SubmitResult> {
  if (!(await isSignedIn("patient"))) {
    return { status: "error", message: "You are logged out. Log in again and retry." };
  }
  const patientId = PATIENTS[0].id;
  const text = String(formData.get("text") ?? "").trim();
  const question = String(formData.get("followUpQuestion") ?? "").trim();
  const answer = String(formData.get("followUpAnswer") ?? "").trim();
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_IMAGES);
  if (!text && files.length === 0) {
    return { status: "error", message: "Write something or add a picture first." };
  }

  const started = Date.now();
  try {
    const images = await Promise.all(
      files.map(async (file) => ({
        data: Buffer.from(await file.arrayBuffer()),
        mediaType: file.type || "image/jpeg",
      })),
    );
    const followUp = question ? { question, answer: answer || null } : null;
    const date = today();
    const questions =
      (await getQuestionSets(patientId)).filter((set) => set.date === date).pop()?.questions ?? [];
    const analysis = await analyze({ patientId, date, text, images, questions, followUp });
    if (analysis.followUpQuestion) {
      return { status: "followup", question: analysis.followUpQuestion };
    }

    const id = randomUUID().slice(0, 8);
    const imageKeys = await Promise.all(
      images.map(async (image, i) => {
        const key = `${imagePrefix(patientId)}${id}-${i}.jpg`;
        await putObject(key, image.data, image.mediaType);
        return key;
      }),
    );
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
      followUp,
      analyzedBy: analysis.analyzedBy,
      caseSummary: null,
    };
    await saveEntry(entry);
    await recordMetrics(patientId, date, entry.scores);
    console.log(`Assessment saved in ${Date.now() - started} ms, scored by ${entry.analyzedBy}`);

    // The clinician's case summary is written after the patient has their
    // answer, so they never wait for it. It is saved as a newer copy of the
    // entry, which is the one later reads pick up.
    after(async () => {
      try {
        const history = (await getEntries(patientId)).filter((e) => e.date !== date);
        const caseSummary = await summarizeCase([...history, entry]);
        await saveEntry({
          ...entry,
          id: `${id}-summary`,
          createdAt: new Date().toISOString(),
          caseSummary,
        });
      } catch (error) {
        console.error("Writing the case summary failed", error);
      }
    });
    return { status: "saved", entry };
  } catch (error) {
    console.error("Saving the assessment failed", error);
    return { status: "error", message: "Something went wrong while saving. Try again." };
  }
}

/** Today's targeted questions for the patient who is logged in; prepared on first ask. */
export async function todaysQuestions(): Promise<QuestionSet | null> {
  if (!(await isSignedIn("patient"))) return null;
  try {
    return await getTodaysQuestions(PATIENTS[0].id, today());
  } catch (error) {
    console.error("Preparing today's questions failed", error);
    return null;
  }
}
