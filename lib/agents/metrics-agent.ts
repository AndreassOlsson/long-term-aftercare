import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta";
import { z } from "zod";
import { METRICS, clampScore, emptyScores, missingMetrics, type Scores } from "../metrics";
import { hasKey, runAgent } from "./run";
import { metricGuide, recordTools } from "./tools";

// AGENT 1: from what the patient entered today to one score per metric.
// A placeholder for the real analysis method: the rest of the app relies only
// on analyze() and the shape it returns.
//
// With ANTHROPIC_API_KEY set Claude does it, and can look at the patient's
// earlier datapoints and entries to read "worse than yesterday" against what
// yesterday actually was. Without a key, or if the call fails, a crude
// keyword count stands in so the flow still works.

export type AnalysisInput = {
  patientId: string;
  date: string;
  text: string;
  images: { data: Buffer; mediaType: string }[];
  /** The targeted questions the patient was shown before writing. */
  questions: string[];
  /** Set on the second pass, when the patient has answered or skipped. */
  followUp: { question: string; answer: string | null } | null;
  /** Scores the patient picked themselves. They are kept as they are. */
  ownScores: Partial<Scores>;
};

export type AnalysisResult = {
  scores: Scores;
  rationale: string;
  /** A question to ask the patient, only when something is missing and nothing has been asked yet. */
  followUpQuestion: string | null;
  analyzedBy: "claude" | "dummy";
};

const SYSTEM = `You read what a patient has entered today about living with their orthosis or prosthesis: free text, sometimes dictated, sometimes with pictures. From it you fill in today's row in the patient's own timeline, which their clinician also reads.

Score each of these from 1 to 5, where 5 is always the good end:
${metricGuide}

Score a metric only when today's text or a picture actually says something about it. If today's entry gives you nothing to go on for a metric, leave it null: a gap in the timeline is better than a guess, because the clinician reads these numbers as the patient's own report.

Patients often speak relatively ("worse than yesterday", "same as last week", "the rubbing is back"). You can look up their earlier datapoints and entries with the tools to anchor such statements to what the record says; a quick look at the last few days is usually enough, and for a plain, absolute entry you may not need to look at all.

When you are done, call record_metrics exactly once. Its fields:
- the three scores, each a number or null
- rationale: one or two plain sentences, addressed to no one, on what in the entry led to the scores
- follow_up_question: when one or more scores are null and the patient has not already been asked a follow-up, one short, friendly question that would let them fill in what is missing, in the language the patient wrote in. Otherwise null.

You are not giving medical advice and you do not diagnose; you only record what the patient reports.`;

function mediaType(type: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  return type === "image/png" || type === "image/gif" || type === "image/webp" ? type : "image/jpeg";
}

async function analyzeWithClaude(input: AnalysisInput): Promise<AnalysisResult> {
  const parts = [`Today is ${input.date}.`];
  if (input.questions.length) {
    parts.push(`Before writing, the patient was shown these questions:\n${input.questions.map((q) => `- ${q}`).join("\n")}`);
  }
  const own = METRICS.filter((m) => input.ownScores[m.key] != null);
  if (own.length) {
    parts.push(
      `The patient scored these themselves, and their scores stand: ${own.map((m) => `${m.key} ${input.ownScores[m.key]}`).join(", ")}. Record them unchanged and do not ask about them.`,
    );
  }
  parts.push(`Today's entry from the patient:\n\n${input.text.trim() || "(no text, pictures only)"}`);
  if (input.followUp) {
    parts.push(
      `The patient was then asked: "${input.followUp.question}"`,
      input.followUp.answer
        ? `They answered: ${input.followUp.answer}`
        : "They chose to skip the question, so do not ask another.",
    );
  }
  const content: BetaContentBlockParam[] = [
    ...input.images.map((image) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: mediaType(image.mediaType),
        data: image.data.toString("base64"),
      },
    })),
    { type: "text", text: parts.join("\n\n") },
  ];

  const score = z.number().nullable();
  let recorded: { scores: Scores; rationale: string; followUp: string | null } | null = null;
  const recordMetrics = betaZodTool({
    name: "record_metrics",
    description: "Hand in today's scores. Call this exactly once, when you are done.",
    inputSchema: z.object({
      itchiness: score,
      comfort: score,
      mobility: score,
      rationale: z.string(),
      follow_up_question: z.string().nullable(),
    }),
    run: (args) => {
      const scores = emptyScores();
      for (const m of METRICS) scores[m.key] = clampScore(args[m.key]);
      recorded = { scores, rationale: args.rationale, followUp: args.follow_up_question };
      return "Recorded.";
    },
  });

  const { getDatapoints, getEntry } = recordTools(input.patientId);
  await runAgent({ system: SYSTEM, content, tools: [getDatapoints, getEntry, recordMetrics] });
  const result = recorded as { scores: Scores; rationale: string; followUp: string | null } | null;
  if (!result) throw new Error("The agent finished without recording metrics");
  return {
    scores: result.scores,
    rationale: result.rationale,
    followUpQuestion:
      input.followUp || missingMetrics(result.scores).length === 0 ? null : result.followUp,
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
  const missing = missingMetrics(scores).filter((m) => input.ownScores[m.key] == null);
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

/** The patient's own scores replace the analysis's; a follow-up is only for what is still missing. */
function withOwnScores(result: AnalysisResult, input: AnalysisInput): AnalysisResult {
  const scores = { ...result.scores };
  for (const m of METRICS) {
    const own = input.ownScores[m.key];
    if (own != null) scores[m.key] = own;
  }
  return {
    ...result,
    scores,
    followUpQuestion: missingMetrics(scores).length === 0 ? null : result.followUpQuestion,
  };
}

export async function analyze(input: AnalysisInput): Promise<AnalysisResult> {
  if (hasKey()) {
    try {
      return withOwnScores(await analyzeWithClaude(input), input);
    } catch (error) {
      console.error("Metrics agent failed, using the keyword stand-in", error);
    }
  }
  return withOwnScores(analyzeWithKeywords(input), input);
}
