import { randomUUID } from "node:crypto";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { addDays, formatDate } from "../dates";
import { getEntries, getQuestionSets, saveQuestionSet } from "../entries";
import { METRICS } from "../metrics";
import { readMetrics } from "../metrics-csv";
import type { QuestionSet } from "../types";
import { hasKey, runAgent } from "./run";
import { metricGuide, recordTools } from "./tools";

// AGENT 2: today's targeted questions. Before the patient writes anything it
// looks at their record (recent and long-term datapoints, what they wrote,
// their pictures, what they were already asked) and picks a few questions
// worth asking today, next to the plain "how are you doing".
//
// The questions are prepared once per day and kept, so reopening the
// assessment shows the same ones, and tomorrow's run can see today's.

const MAX_QUESTIONS = 3;

const SYSTEM = `A patient with an orthosis or prosthesis does a short daily check-in in an app: they are always asked how they are doing, and they answer freely in text, by voice or with pictures. Your job is to prepare the few extra questions that are worth asking this patient today, based on their own record, so the check-in feels like someone has been paying attention.

Their answers are later turned into three scores per day, each 1 to 5 with 5 as the good end:
${metricGuide}

Look at the record with the tools before you decide:
- the short term: the last week or two of datapoints. Has something dropped or spiked? Did they report nothing yesterday, or leave a metric out for several days?
- the long term: the months before, to tell a blip from a trend.
- their own words and pictures on the days that stand out. Something they mentioned once and never came back to (a red mark, a looser fit, a shortened walk) is often the best question.
- the questions they were already asked. Do not repeat a recent question unless the thing it was about is still open, and then say that it is a follow-up.

The point of the questions is to get her to reflect on her own patterns, and to get into the record what a clinician would have asked. So prefer questions that make her connect things over questions that ask for a status: what she was doing before it got worse, what differed on the good days and the bad ones, the time of day it starts, whether it comes with long walks, a hot day, a new routine, whether it has been the same on both sides, what she did that helped. Ask about the pattern you actually see in her record, and say what you saw ("the last three entries where you walked far are the three itchy ones").

Then write one to ${MAX_QUESTIONS} questions. Make them personal and concrete: "You wrote on Tuesday that the socket had started to rub on the outside of your knee. What were you doing before it started, and does it come on at a certain time of day?" is the kind of question wanted, "How is your comfort?" is not. One question should be open enough to answer in her own words. Keep each to a sentence or two, warm and plain, in the language the patient writes in. If the record shows nothing in particular, one light question is enough.

You are not giving medical advice and you do not diagnose or alarm: you ask, you do not conclude.

When you are done, call set_todays_questions exactly once, with the questions and one sentence on what in the record they are based on.`;

async function askClaude(patientId: string, date: string) {
  let chosen: { questions: string[]; basedOn: string } | null = null;
  const setTodaysQuestions = betaZodTool({
    name: "set_todays_questions",
    description: "Hand in today's questions. Call this exactly once, when you are done.",
    inputSchema: z.object({
      questions: z.array(z.string()),
      based_on: z.string(),
    }),
    run: (args) => {
      chosen = { questions: args.questions, basedOn: args.based_on };
      return "Saved.";
    },
  });
  const { getDatapoints, getEntry, getPreviousQuestions } = recordTools(patientId);
  await runAgent({
    system: SYSTEM,
    content: `Today is ${date}. Prepare today's questions for this patient.`,
    tools: [getDatapoints, getEntry, getPreviousQuestions, setTodaysQuestions],
  });
  const result = chosen as { questions: string[]; basedOn: string } | null;
  const questions = (result?.questions ?? []).map((q) => q.trim()).filter(Boolean);
  if (!result || questions.length === 0) throw new Error("The agent finished without questions");
  return { questions: questions.slice(0, MAX_QUESTIONS), basedOn: result.basedOn };
}

/** Stand-in without a key: the same idea from the numbers and her words alone. */
async function askFromNumbers(patientId: string, date: string) {
  const rows = (await readMetrics(patientId)).filter((row) => row.date < date);
  const entries = await getEntries(patientId);
  const last = rows[rows.length - 1];
  const questions: string[] = [];
  const reasons: string[] = [];
  if (!last || last.date < addDays(date, -10)) {
    questions.push("It has been a while since you checked in. What has the last stretch been like, and was there a day that stood out?");
    reasons.push("no entry in the last ten days");
  }
  if (last) {
    const weekAgo = rows.filter((row) => row.date <= addDays(last.date, -14)).pop();
    const worst = METRICS.map((m) => ({
      m,
      now: last.scores[m.key],
      drop: (weekAgo?.scores[m.key] ?? 0) - (last.scores[m.key] ?? 0),
    }))
      .filter((x) => x.now !== null && x.drop >= 1)
      .sort((a, b) => b.drop - a.drop)[0];
    if (worst) {
      const since = rows.find((row) => row.date > addDays(last.date, -21))?.date ?? last.date;
      questions.push(
        `Your ${worst.m.label.toLowerCase()} has been worse since about ${formatDate(since)}. What was different around then: how much you were on your feet, a new routine, the weather? And what is it like at different times of the day?`,
      );
      reasons.push(`${worst.m.key} fell by ${worst.drop.toFixed(1)} over two weeks`);
    }
    const lastWords = [...entries].reverse().find((e) => e.date < date && e.text.trim());
    if (lastWords) {
      questions.push(
        `On ${formatDate(lastWords.date)} you wrote “${lastWords.text.trim().slice(0, 120).replace(/[.!?]+$/, "")}${lastWords.text.length > 120 ? "…" : ""}”. Has that changed since, and what do you think is behind it?`,
      );
      reasons.push(`your own words on ${lastWords.date}`);
    }
    const silent = METRICS.find((m) => rows.slice(-3).every((row) => row.scores[m.key] === null));
    if (silent) {
      questions.push(`You have not mentioned ${silent.label.toLowerCase()} for a few entries. How has it been, compared with how it usually is?`);
      reasons.push(`no ${silent.key} value in the last three entries`);
    }
  }
  if (questions.length === 0) {
    questions.push("What did you do today that you could not have done a few months ago, and was there anything you held back from?");
    reasons.push("nothing stands out in the numbers");
  }
  return {
    questions: questions.slice(0, MAX_QUESTIONS),
    basedOn: `Built-in stand-in, not the AI: ${reasons.join("; ")}.`,
  };
}

export async function getTodaysQuestions(patientId: string, date: string): Promise<QuestionSet> {
  const existing = (await getQuestionSets(patientId)).filter((s) => s.date === date).pop();
  if (existing) return existing;

  let askedBy: QuestionSet["askedBy"] = "dummy";
  let result: { questions: string[]; basedOn: string } | null = null;
  if (hasKey()) {
    try {
      result = await askClaude(patientId, date);
      askedBy = "claude";
    } catch (error) {
      console.error("Question agent failed, using the numeric stand-in", error);
    }
  }
  result ??= await askFromNumbers(patientId, date);

  const set: QuestionSet = {
    id: randomUUID().slice(0, 8),
    patientId,
    date,
    createdAt: new Date().toISOString(),
    questions: result.questions,
    basedOn: result.basedOn,
    askedBy,
  };
  await saveQuestionSet(set);
  return set;
}
