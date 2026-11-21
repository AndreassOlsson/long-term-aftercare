import { z } from "zod";
import { createHash } from "node:crypto";
import { METRICS } from "../metrics";
import { getObject, putObject } from "../storage";
import type { Entry } from "../types";
import { askText, hasKey } from "./run";
import { metricGuide } from "./tools";

// The short summary the clinician reads at the top of a patient's record.
// Every claim in it carries the days it rests on, so the screen can link each
// one to the entry. One plain call, no tools: the recent entries are small
// enough to send whole. When no key is set or the call fails, a stand-in
// built from the figures writes it, and the summary says which one did.

export type SummarySentence = { text: string; days: string[] };
export type CaseSummary = {
  by: "claude" | "stand-in";
  sentences: SummarySentence[];
  /** Set when the AI was meant to write it and could not. */
  note: string | null;
};

const fmt = (v: number | null) => (v === null ? "-" : v.toFixed(1));
const MAX_DAYS = 60;

function sentencesOf(text: string): SummarySentence[] {
  return [{ text, days: [] }];
}

/** The stand-in: plain statements straight from the figures, each with its days. */
function standIn(entries: Entry[]): SummarySentence[] {
  const scored = entries.filter((e) => e.combined !== null);
  if (scored.length === 0) return sentencesOf("No scored entries yet.");
  const last = scored[scored.length - 1];
  const earlier = scored.slice(0, Math.max(1, scored.length - 14));
  const early = earlier.slice(-14);
  const avg = (rows: Entry[], f: (e: Entry) => number | null) => {
    const v = rows.map(f).filter((n): n is number => n !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const out: SummarySentence[] = [];
  const before = avg(early, (e) => e.combined);
  const recent = avg(scored.slice(-5), (e) => e.combined);
  out.push({
    text: `The combined figure is ${fmt(recent)} over the last five entries, against ${fmt(before)} earlier in the record (5 is the good end).`,
    days: [early[early.length - 1]?.date, last.date].filter((d): d is string => Boolean(d)),
  });
  for (const m of METRICS) {
    const b = avg(early, (e) => e.scores[m.key]);
    const r = avg(scored.slice(-5), (e) => e.scores[m.key]);
    if (b !== null && r !== null && Math.abs(r - b) >= 0.5) {
      out.push({
        text: `${m.label} has ${r < b ? "fallen" : "risen"} from ${fmt(b)} to ${fmt(r)}.`,
        days: [last.date],
      });
    }
  }
  const quoted = scored.filter((e) => e.text.trim()).slice(-3);
  for (const e of quoted) {
    out.push({ text: `On ${e.date} she wrote: “${e.text.trim().slice(0, 160)}”`, days: [e.date] });
  }
  return out;
}

const shape = z.object({
  sentences: z.array(z.object({ text: z.string().min(1), days: z.array(z.string()) })).min(1).max(8),
});

function fromModel(raw: string, entries: Entry[]): SummarySentence[] {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const parsed = shape.parse(JSON.parse(json));
  const known = new Set(entries.map((e) => e.date));
  // A claim may only point at a day that exists in the record.
  return parsed.sentences.map((s) => ({ text: s.text, days: s.days.filter((d) => known.has(d)) }));
}

async function viaClaude(entries: Entry[]): Promise<SummarySentence[]> {
  const lines = entries.slice(-MAX_DAYS).map((e) => {
    const scores = METRICS.map((m) => `${m.key} ${fmt(e.scores[m.key])}`).join(", ");
    return `${e.date}: combined ${fmt(e.combined)} (${scores})${e.text ? ` | patient's note: ${e.text}` : ""}`;
  });
  const raw = await askText(
    `You write the short summary a clinician reads before looking at a patient's self-reported record for their orthosis or prosthesis. Scores run from 1 to 5 and 5 is always the good end. The measures:\n${metricGuide}\n\nWrite three to six sentences: how things went over the period, what changed and since when, and what the patient says in their own terms. Report only what the entries say; do not diagnose, name causes, or recommend treatment. Every sentence must list the dates (YYYY-MM-DD, taken from the entries given) it rests on.\n\nReply with JSON only, in this shape: {"sentences":[{"text":"...","days":["YYYY-MM-DD"]}]}`,
    lines.join("\n"),
  );
  return fromModel(raw, entries);
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms))]);

const cacheKey = (patientId: string) => `patients/${patientId}/summary.json`;
const fingerprint = (entries: Entry[]) =>
  createHash("sha256")
    .update(JSON.stringify(entries.slice(-MAX_DAYS).map((e) => [e.date, e.combined, e.text])))
    .digest("hex")
    .slice(0, 16);

/**
 * The summary for the clinician's screen. An AI-written one is kept until the
 * record changes, so opening the page does not call the model every time; a
 * stand-in is never kept, so a later load can try the AI again.
 */
export async function buildCaseSummary(patientId: string, entries: Entry[]): Promise<CaseSummary> {
  if (entries.length === 0) return { by: "stand-in", sentences: standIn(entries), note: null };
  if (!hasKey()) {
    return { by: "stand-in", sentences: standIn(entries), note: "No AI key is set on this deployment." };
  }
  const print = fingerprint(entries);
  try {
    const cached = await getObject(cacheKey(patientId), { fresh: true });
    if (cached) {
      const kept = JSON.parse(cached.body.toString("utf8")) as CaseSummary & { print: string };
      if (kept.print === print) return { by: kept.by, sentences: kept.sentences, note: null };
    }
  } catch {
    // An unreadable cache is the same as none.
  }
  try {
    const sentences = await withTimeout(viaClaude(entries), 25000);
    const summary: CaseSummary = { by: "claude", sentences, note: null };
    await putObject(cacheKey(patientId), JSON.stringify({ ...summary, print }), "application/json").catch(() => {});
    return summary;
  } catch (error) {
    console.error("Case summary failed, using the stand-in", error);
    return { by: "stand-in", sentences: standIn(entries), note: "The AI call failed, so the stand-in wrote this." };
  }
}

// The patient's side stores a plain-text summary on each saved entry; that
// call keeps its old shape.
export async function summarizeCase(entries: Entry[]): Promise<string> {
  if (hasKey()) {
    try {
      const sentences = await withTimeout(viaClaude(entries), 25000);
      return sentences.map((s) => s.text).join(" ");
    } catch (error) {
      console.error("Case summary failed, using the numeric stand-in", error);
    }
  }
  return standIn(entries).map((s) => s.text).join(" ") + " (Written by the built-in stand-in, not by the AI analysis.)";
}
