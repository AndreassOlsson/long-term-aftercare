import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaToolResultContentBlockParam } from "@anthropic-ai/sdk/resources/beta";
import { z } from "zod";
import { getEntries, getQuestionSets } from "../entries";
import { METRICS } from "../metrics";
import { readMetrics, toCsv } from "../metrics-csv";
import { getObject } from "../storage";

// What an agent can look up in one patient's record. The patient is fixed
// when the tools are made, so a model can never ask for someone else's data.

const day = z.string().describe("A day as YYYY-MM-DD");

export const metricGuide = METRICS.map((m) => `- ${m.key} (${m.label}): ${m.scale}`).join("\n");

export function recordTools(patientId: string) {
  const getDatapoints = betaZodTool({
    name: "get_datapoints",
    description:
      "The patient's finalized daily scores as CSV, one row per day they reported. Give a range to look at the short term (the last week or two) or the long term (months). An empty cell means the patient said nothing about that metric that day.",
    inputSchema: z.object({ from: day.optional(), to: day.optional() }),
    run: async ({ from, to }) => {
      const rows = (await readMetrics(patientId)).filter(
        (row) => (!from || row.date >= from) && (!to || row.date <= to),
      );
      return rows.length ? toCsv(rows) : "No datapoints in that range.";
    },
  });

  const getEntry = betaZodTool({
    name: "get_entry",
    description:
      "What the patient themselves entered on one day: their own words, the questions they were shown, any follow-up, and the pictures they took. Use it on days that stand out in the datapoints.",
    inputSchema: z.object({ date: day }),
    run: async ({ date }) => {
      const entry = (await getEntries(patientId)).find((e) => e.date === date);
      if (!entry) return `Nothing was entered on ${date}.`;
      const lines = [`Entry for ${date}.`, `Patient's words: ${entry.text || "(none)"}`];
      if (entry.questions?.length) lines.push(`Questions shown that day: ${entry.questions.join(" / ")}`);
      if (entry.followUp) {
        lines.push(`Follow-up asked: ${entry.followUp.question}`, `Answer: ${entry.followUp.answer ?? "(skipped)"}`);
      }
      const blocks: BetaToolResultContentBlockParam[] = [{ type: "text", text: lines.join("\n") }];
      for (const key of entry.images) {
        const image = await getObject(key);
        if (!image) continue;
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: image.body.toString("base64") },
        });
      }
      return blocks;
    },
  });

  const getPreviousQuestions = betaZodTool({
    name: "get_previous_questions",
    description:
      "The targeted questions this patient has been asked on earlier days, with the day each set was asked, newest last.",
    inputSchema: z.object({ since: day.optional() }),
    run: async ({ since }) => {
      const sets = (await getQuestionSets(patientId)).filter((s) => !since || s.date >= since);
      if (sets.length === 0) return "No targeted questions have been asked yet.";
      return sets.map((s) => `${s.date}: ${s.questions.join(" / ")}`).join("\n");
    },
  });

  return { getDatapoints, getEntry, getPreviousQuestions };
}
