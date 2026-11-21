import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  METRICS,
  clampScore,
  emptyScores,
  missingMetrics,
  type Scores,
} from "./metrics";
import type { Entry } from "./types";

// THE PLACEHOLDER. This file is the whole analysis step and is meant to be
// replaced: it turns what the patient entered into one score per metric, and
// it writes the clinician's case summary. The rest of the app only relies on
// the two exported functions and their return shapes.
//
// With ANTHROPIC_API_KEY set it asks Claude; without one, or if the call
// fails, it falls back to a crude keyword count so the flow still works.

export type AnalysisInput = {
  text: string;
  images: { data: Buffer; mediaType: string }[];
  /** Set on the second pass, when the patient has answered or skipped. */
  followUp: { question: string; answer: string | null } | null;
};

export type AnalysisResult = {
  scores: Scores;
  rationale: string;
  /** A question to ask the patient, only when something is missing and nothing has been asked yet. */
  followUpQuestion: string | null;
  analyzedBy: "claude" | "dummy";
};

const MODEL = process.env.ANALYSIS_MODEL ?? "claude-opus-5-5";
const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

const metricList = METRICS.map((m) => `- ${m.key} (${m.label}): ${m.scale}`).join("\n");

const SYSTEM = `You read what a patient has entered today about living with their orthosis or prosthesis: free text, sometimes dictated, sometimes with pictures. From it you fill in a short structured record for the patient's own timeline, which their clinician also reads.

Score each of these from 1 to 5, where 5 is always the good end:
${metricList}

Score a metric only when the text or a picture actually says something about it. If today's entry gives you nothing to go on for a metric, leave it null: a gap in the timeline is better than a guess, because the clinician reads these numbers as the patient's own report.

rationale: one or two plain sentences, addressed to no one, on what in the entry led to the scores.

follow_up_question: when one or more metrics are null and the patient has not already been asked a follow-up, write one short, friendly question that would let them fill in what is missing. Write it in the language the patient wrote in. Otherwise null.

You are not giving medical advice and you do not diagnose; you only record what the patient reports.`;

const Output = z.object({
  scores: z.object(
    Object.fromEntries(METRICS.map((m) => [m.key, z.number().nullable()])) as Record<
      (typeof METRICS)[number]["key"],
      z.ZodNullable<z.ZodNumber>
    >,
  ),
  rationale: z.string(),
  follow_up_question: z.string().nullable(),
});

function mediaType(type: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  return type === "image/png" || type === "image/gif" || type === "image/webp"
    ? type
    : "image/jpeg";
}

async function analyzeWithClaude(input: AnalysisInput): Promise<AnalysisResult> {
  const client = new Anthropic();
  const parts = [`Today's entry from the patient:\n\n${input.text.trim() || "(no text, pictures only)"}`];
  if (input.followUp) {
    parts.push(
      `The patient was then asked: "${input.followUp.question}"`,
      input.followUp.answer
        ? `They answered: ${input.followUp.answer}`
        : "They chose to skip the question, so do not ask another.",
    );
  }
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: betaZodOutputFormat(Output) },
    messages: [
      {
        role: "user",
        content: [
          ...input.images.map((image) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: mediaType(image.mediaType),
              data: image.data.toString("base64"),
            },
          })),
          { type: "text" as const, text: parts.join("\n\n") },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Analysis returned no result (stop reason: ${response.stop_reason})`);
  }
  const out = response.parsed_output;
  const scores = emptyScores();
  for (const m of METRICS) scores[m.key] = clampScore(out.scores[m.key]);
  return {
    scores,
    rationale: out.rationale,
    followUpQuestion:
      input.followUp || missingMetrics(scores).length === 0 ? null : out.follow_up_question,
    analyzedBy: "claude",
  };
}

const POSITIVE = ["good", "great", "better", "fine", "no ", "not ", "without", "easy", "easily", "well", "bra", "bättre", "ingen", "inte", "lätt"];
const NEGATIVE = ["bad", "worse", "worst", "very", "a lot", "terrible", "hard", "difficult", "can't", "cannot", "painful", "dålig", "värre", "mycket", "svårt", "jätte"];

/** Crude stand-in: finds sentences that mention a metric and counts good and bad words in them. */
function analyzeWithKeywords(input: AnalysisInput): AnalysisResult {
  const text = `${input.text} ${input.followUp?.answer ?? ""}`.toLowerCase();
  const sentences = text.split(/[.!?\n]+/).filter((s) => s.trim());
  const scores = emptyScores();
  for (const m of METRICS) {
    const about = sentences.filter((s) => m.keywords.some((k) => s.includes(k)));
    if (about.length === 0) continue;
    const joined = about.join(" ");
    const count = (words: string[]) => words.filter((w) => joined.includes(w)).length;
    scores[m.key] = clampScore(3 + count(POSITIVE) - count(NEGATIVE));
  }
  const missing = missingMetrics(scores);
  return {
    scores,
    rationale: "Scored by the built-in keyword stand-in, not by the AI analysis.",
    followUpQuestion:
      input.followUp || missing.length === 0
        ? null
        : `Could you also say a little about ${missing.map((m) => m.label.toLowerCase()).join(" and ")} today?`,
    analyzedBy: "dummy",
  };
}

export async function analyze(input: AnalysisInput): Promise<AnalysisResult> {
  if (hasKey()) {
    try {
      return await analyzeWithClaude(input);
    } catch (error) {
      console.error("Claude analysis failed, using the keyword stand-in", error);
    }
  }
  return analyzeWithKeywords(input);
}

const fmt = (v: number | null) => (v === null ? "-" : v.toFixed(1));

function summarizeWithNumbers(entries: Entry[]): string {
  const scored = entries.filter((e) => e.combined !== null);
  if (scored.length === 0) return "No scored entries yet.";
  const last = scored[scored.length - 1];
  const before = scored[Math.max(0, scored.length - 8)];
  const delta = (last.combined as number) - (before.combined as number);
  const trend = Math.abs(delta) < 0.3 ? "about the same as" : delta < 0 ? "down from" : "up from";
  const lowest = [...METRICS].sort(
    (a, b) => (last.scores[a.key] ?? 9) - (last.scores[b.key] ?? 9),
  )[0];
  return `${scored.length} scored entries. Combined satisfaction is ${fmt(last.combined)} on ${last.date}, ${trend} ${fmt(before.combined)} a week earlier. The lowest metric in the latest entry is ${lowest.label.toLowerCase()} at ${fmt(last.scores[lowest.key])}. (Written by the built-in stand-in, not by the AI analysis.)`;
}

async function summarizeWithClaude(entries: Entry[]): Promise<string> {
  const client = new Anthropic();
  const lines = entries.slice(-30).map((e) => {
    const scores = METRICS.map((m) => `${m.key} ${fmt(e.scores[m.key])}`).join(", ");
    return `${e.date}: combined ${fmt(e.combined)} (${scores})${e.text ? `\n  Patient's note: ${e.text}` : ""}`;
  });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: `You write the short case summary a clinician reads before looking at a patient's self-reported timeline for their orthosis or prosthesis. Scores run from 1 to 5 and 5 is always the good end. The metrics:\n${metricList}\n\nWrite three to five plain sentences: how things have gone over the period, what has changed recently, and what the patient themselves describes, in their own terms where they wrote something. Report only what the entries say; do not diagnose or recommend treatment. Reply with the summary text only.`,
    messages: [{ role: "user", content: lines.join("\n") }],
  });
  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
  if (response.stop_reason === "refusal" || !text) {
    throw new Error(`Summary returned no text (stop reason: ${response.stop_reason})`);
  }
  return text;
}

export async function summarizeCase(entries: Entry[]): Promise<string> {
  if (hasKey()) {
    try {
      return await summarizeWithClaude(entries);
    } catch (error) {
      console.error("Claude summary failed, using the numeric stand-in", error);
    }
  }
  return summarizeWithNumbers(entries);
}
