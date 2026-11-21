"use server";

import { randomUUID } from "node:crypto";
import { analyze, summarizeCase } from "./analysis";
import { isSignedIn } from "./auth";
import { today } from "./dates";
import { getEntries, imagePrefix, saveEntry } from "./entries";
import { combine } from "./metrics";
import { PATIENTS } from "./patients";
import { putObject } from "./storage";
import type { Entry } from "./types";

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

  try {
    const images = await Promise.all(
      files.map(async (file) => ({
        data: Buffer.from(await file.arrayBuffer()),
        mediaType: file.type || "image/jpeg",
      })),
    );
    const followUp = question ? { question, answer: answer || null } : null;
    const analysis = await analyze({ text, images, followUp });
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
      date: today(),
      createdAt: new Date().toISOString(),
      text,
      images: imageKeys,
      scores: analysis.scores,
      combined: combine(analysis.scores),
      rationale: analysis.rationale,
      followUp,
      analyzedBy: analysis.analyzedBy,
      caseSummary: null,
    };
    const history = (await getEntries(patientId)).filter((e) => e.date !== entry.date);
    entry.caseSummary = await summarizeCase([...history, entry]);
    await saveEntry(entry);
    return { status: "saved", entry };
  } catch (error) {
    console.error("Saving the assessment failed", error);
    return { status: "error", message: "Something went wrong while saving. Try again." };
  }
}
