import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { formatDate } from "../dates";
import { getEntries } from "../entries";
import { labelFor, sustainedChange, wordFor } from "../metrics";
import { readMetrics } from "../metrics-csv";
import type { Entry } from "../types";
import { hasKey, runAgent } from "./run";
import { metricGuide, recordTools } from "./tools";

// AGENT 4: prepares a request for a check-up from the record, for the
// patient to read, change and send. It reports what changed and since when,
// with her own words and the days it rests on; it does not diagnose.

export type RequestDraft = {
  headline: string;
  body: string;
  evidenceDates: string[];
  /** Storage keys of pictures from the record, proposed for attachment. */
  images: string[];
  madeBy: "claude" | "dummy";
};

const SYSTEM = `You prepare a request for a check-up on behalf of a patient with an orthosis or prosthesis. The patient will read it, change it and send it to the clinic, which reads it as a case. Write it in the first person as the patient, plainly, in a few short paragraphs: what has changed and since when, in words (never "comfort 2.0"; say "uncomfortable, where it used to be comfortable"), a couple of her own words quoted from her entries with their dates, and what she would like (to be seen). Do not diagnose, do not guess causes, do not recommend treatment.

Scores run 1 to 5, 5 the good end, and are only used by you to find what changed:
${metricGuide}

Look at the record with the tools: the datapoints to find when things moved, and the entries on the days that stand out. Pick the days the request rests on from days that exist in the record (the first days of the change and the days she wrote the most), and the pictures: say which day's pictures are worth attaching by listing those days in picture_days.

When done, call set_request exactly once with: headline (one line for the clinic's inbox, what changed and since when), body, evidence_dates, picture_days.`;

const text = (e: Entry) => `${e.text} ${e.followUp?.answer ?? ""}`.trim();

const pictures = (entries: Entry[], days: string[]) =>
  entries.filter((e) => days.includes(e.date)).flatMap((e) => e.images).slice(0, 3);

async function draftWithClaude(patientId: string, now: string, entries: Entry[]): Promise<RequestDraft> {
  let chosen: { headline: string; body: string; evidence: string[]; pictureDays: string[] } | null = null;
  const setRequest = betaZodTool({
    name: "set_request",
    description: "Hand in the prepared request. Call this exactly once, when you are done.",
    inputSchema: z.object({
      headline: z.string(),
      body: z.string(),
      evidence_dates: z.array(z.string()),
      picture_days: z.array(z.string()),
    }),
    run: (args) => {
      chosen = { headline: args.headline, body: args.body, evidence: args.evidence_dates, pictureDays: args.picture_days };
      return "Saved.";
    },
  });
  const { getDatapoints, getEntry } = recordTools(patientId);
  await runAgent({
    system: SYSTEM,
    content: `Today is ${now}. Prepare the request for this patient.`,
    tools: [getDatapoints, getEntry, setRequest],
  });
  const result = chosen as { headline: string; body: string; evidence: string[]; pictureDays: string[] } | null;
  if (!result || !result.body.trim()) throw new Error("The agent finished without a request");
  const real = new Set(entries.map((e) => e.date));
  return {
    headline: result.headline.trim(),
    body: result.body.trim(),
    evidenceDates: result.evidence.filter((d) => real.has(d)),
    images: pictures(entries, result.pictureDays),
    madeBy: "claude",
  };
}

async function draftFromRecord(patientId: string, now: string, entries: Entry[]): Promise<RequestDraft> {
  const rows = await readMetrics(patientId);
  const change = sustainedChange(rows, now);
  const since = change?.since ?? entries[Math.max(0, entries.length - 5)]?.date ?? now;
  const inPeriod = entries.filter((e) => e.date >= since);
  const withWords = inPeriod.filter((e) => text(e));
  const lines: string[] = [];
  if (change && change.measures.length) {
    const parts = change.measures.map(
      (m) => `my ${labelFor(m.key).toLowerCase()} has gone from “${wordFor(m.key, m.usual).toLowerCase()}” to “${wordFor(m.key, m.recent).toLowerCase()}”`,
    );
    lines.push(`Since about ${formatDate(since)} things have got worse with my prosthesis: ${parts.join(", and ")}.`);
    lines.push(`Overall it used to be “${wordFor("combined", change.usualCombined).toLowerCase()}” and lately it has been “${wordFor("combined", change.recentCombined).toLowerCase()}”.`);
  } else {
    const last = entries[entries.length - 1];
    lines.push(`I would like to be seen about how my prosthesis is working${last ? `; lately it has been “${wordFor("combined", last.combined).toLowerCase()}”` : ""}.`);
  }
  if (withWords.length) {
    lines.push("In my own words:");
    for (const e of withWords.slice(-3)) lines.push(`${formatDate(e.date)}: “${text(e)}”`);
  }
  lines.push("I would like to come in for a check-up.");
  const evidence = [...new Set([...(change?.dates.slice(0, 2) ?? []), ...withWords.slice(-3).map((e) => e.date)])].sort();
  const worst = change?.measures[0];
  const headline = worst
    ? `${labelFor(worst.key)} worse since ${formatDate(since)}, overall now “${wordFor("combined", change!.recentCombined).toLowerCase()}”`
    : "Patient asks for a check-up";
  return {
    headline,
    body: lines.join("\n\n"),
    evidenceDates: evidence,
    images: pictures(entries, entries.filter((e) => e.images.length && e.date >= since).map((e) => e.date)),
    madeBy: "dummy",
  };
}

export async function draftRequest(patientId: string, now: string): Promise<RequestDraft> {
  const entries = await getEntries(patientId);
  if (hasKey()) {
    try {
      return await draftWithClaude(patientId, now, entries);
    } catch (error) {
      console.error("Request agent failed, using the stand-in", error);
    }
  }
  return draftFromRecord(patientId, now, entries);
}

