import { METRICS } from "../metrics";
import type { Entry } from "../types";
import { askText, hasKey } from "./run";
import { metricGuide } from "./tools";

// The short case summary the clinician reads above the graph. One plain call,
// no tools: the recent entries are small enough to send whole.

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

export async function summarizeCase(entries: Entry[]): Promise<string> {
  if (hasKey()) {
    try {
      const lines = entries.slice(-30).map((e) => {
        const scores = METRICS.map((m) => `${m.key} ${fmt(e.scores[m.key])}`).join(", ");
        return `${e.date}: combined ${fmt(e.combined)} (${scores})${e.text ? `\n  Patient's note: ${e.text}` : ""}`;
      });
      return await askText(
        `You write the short case summary a clinician reads before looking at a patient's self-reported timeline for their orthosis or prosthesis. Scores run from 1 to 5 and 5 is always the good end. The metrics:\n${metricGuide}\n\nWrite three to five plain sentences: how things have gone over the period, what has changed recently, and what the patient themselves describes, in their own terms where they wrote something. Report only what the entries say; do not diagnose or recommend treatment. Reply with the summary text only.`,
        lines.join("\n"),
      );
    } catch (error) {
      console.error("Case summary failed, using the numeric stand-in", error);
    }
  }
  return summarizeWithNumbers(entries);
}
