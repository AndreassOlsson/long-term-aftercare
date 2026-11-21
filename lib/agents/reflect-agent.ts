import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { formatDate } from "../dates";
import { getEntries } from "../entries";
import { METRICS, combine, wordFor, type Scores } from "../metrics";
import type { Entry } from "../types";
import { hasKey, runAgent } from "./run";
import { metricGuide, recordTools } from "./tools";

// AGENT 5: the app's answer to a bad day. After the entry and the picture are
// in, and before anything is saved, it looks at today in the light of the days
// before. On a bad day that follows bad days it asks one question (have you
// done anything different, or has it declined on its own?), takes the answer,
// and closes with what it will record and, when the record and today warrant
// it, a recommendation to ask the clinic for a check-up. On an ordinary day it
// asks nothing and recommends nothing.
//
// Whether a day is bad is decided here in code, from the numbers, never by the
// model: the model only words the question and the recommendation. A wound or a
// sign of infection outranks all of it: no question, and the recommendation is
// to contact the clinic.

export type DayJudgement = {
  /** Today is clearly low and the days just before were low as well. */
  bad: boolean;
  /** A wound or sign of infection was mentioned: contact the clinic, no questions. */
  concern: boolean;
  /** The one question is asked: a bad day, nothing about a wound. */
  ask: boolean;
  /** The two choices at the end include asking the clinic for a check-up. */
  recommend: boolean;
  todayCombined: number | null;
  /** The days just before, newest first, as dates and combined figures. */
  before: { date: string; combined: number }[];
};

const LOW_TODAY = 2.6;
const LOW_BEFORE = 3.2;
const WINDOW_DAYS = 6;

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Today in the light of the record: pure, so the same record gives the same verdict everywhere. */
export function judgeDay(entries: Pick<Entry, "date" | "combined">[], date: string, scores: Scores, concern: boolean): DayJudgement {
  const todayCombined = combine(scores);
  const before = entries
    .filter((e) => e.date < date && e.combined !== null && daysBetween(e.date, date) <= WINDOW_DAYS)
    .map((e) => ({ date: e.date, combined: e.combined as number }))
    .reverse();
  const bad = todayCombined !== null && todayCombined <= LOW_TODAY && before.length > 0 && before[0].combined <= LOW_BEFORE;
  return { bad, concern, ask: bad && !concern, recommend: bad || concern, todayCombined, before };
}

export type Exchange = {
  /** The question for a bad day; null when none is asked. */
  question: string | null;
  madeBy: "claude" | "dummy";
};

export type Closing = {
  /** What will be entered, in a sentence or two. */
  message: string;
  /** The recommendation to ask the clinic, or null on an ordinary day. */
  recommendation: string | null;
  madeBy: "claude" | "dummy";
};

type Today = { text: string; scores: Scores; imageCount: number };

const describeToday = (today: Today) =>
  [
    `Today's entry from the patient: ${today.text.trim() || "(no text)"}`,
    `Pictures with it: ${today.imageCount}.`,
    `Scores recorded for today (1 to 5, 5 the good end): ${METRICS.map((m) => `${m.key} ${today.scores[m.key] ?? "none"}`).join(", ")}; combined ${combine(today.scores) ?? "none"}.`,
  ].join("\n");

const SYSTEM = `A patient with an orthosis or prosthesis has just done today's check-in in an app: their words, maybe a picture, and the scores read from them. Nothing is saved yet. The app has found that today is a bad day that follows bad days, and answers it, as a person who has been paying attention would: plainly, warmly, in the language the patient wrote in, never alarming and never diagnosing.

Scores run 1 to 5, 5 the good end:
${metricGuide}

You can look up the earlier days with the tools (the datapoints, and what she wrote on a day). Anchor what you say in the record: "you have been lower since the 12th, and yesterday was bad too". Do not guess causes and do not recommend treatment.`;

const ASK = `${SYSTEM}

Ask exactly one question, in one or two sentences: you can see that today looks bad as well, in view of the days before it, and you want to know whether she has done anything different, or whether it has declined on its own. Say what you see in the record in a few words before asking. When done, call set_question exactly once.`;

const CLOSE = `${SYSTEM}

She has answered your question. Close the exchange with two short pieces. message: that you will enter this as today's entry, in a sentence or two, taking her answer into account. recommendation: that, given how long and how far it has gone down, you recommend she sends a report to the clinic so they can see her; say why in the record's terms, in one or two sentences. A recommendation is only a recommendation: she chooses. When done, call set_closing exactly once.`;

async function askClaude(patientId: string, date: string, today: Today, judgement: DayJudgement): Promise<string> {
  let question: string | null = null;
  const setQuestion = betaZodTool({
    name: "set_question",
    description: "Hand in the one question. Call this exactly once, when you are done.",
    inputSchema: z.object({ question: z.string() }),
    run: (args) => {
      question = args.question.trim();
      return "Saved.";
    },
  });
  const { getDatapoints, getEntry } = recordTools(patientId);
  await runAgent({
    system: ASK,
    content: `Today is ${date}.\n${describeToday(today)}\nThe days just before, newest first: ${judgement.before.map((b) => `${b.date} ${b.combined}`).join(", ")}.`,
    tools: [getDatapoints, getEntry, setQuestion],
  });
  if (!question) throw new Error("The agent finished without a question");
  return question;
}

function askFromNumbers(date: string, judgement: DayJudgement): string {
  const yesterday = judgement.before[0];
  const lead = yesterday && daysBetween(yesterday.date, date) === 1 ? "yesterday was bad too" : `your last check-in, on ${formatDate(yesterday.date)}, was low as well`;
  return `I can see that you are looking bad today as well, and ${lead}. Have you done anything different, or has it declined on its own?`;
}

/** The one question for a bad day, or none. Nothing is stored. */
export async function askAboutToday(patientId: string, date: string, today: Today, concern: boolean): Promise<{ judgement: DayJudgement; exchange: Exchange }> {
  const judgement = judgeDay(await getEntries(patientId), date, today.scores, concern);
  if (!judgement.ask) return { judgement, exchange: { question: null, madeBy: "dummy" } };
  if (hasKey()) {
    try {
      return { judgement, exchange: { question: await askClaude(patientId, date, today, judgement), madeBy: "claude" } };
    } catch (error) {
      console.error("Reflect agent failed, using the stand-in", error);
    }
  }
  return { judgement, exchange: { question: askFromNumbers(date, judgement), madeBy: "dummy" } };
}

async function closeWithClaude(patientId: string, date: string, today: Today, judgement: DayJudgement, question: string, answer: string): Promise<{ message: string; recommendation: string }> {
  let closing: { message: string; recommendation: string } | null = null;
  const setClosing = betaZodTool({
    name: "set_closing",
    description: "Hand in the closing. Call this exactly once, when you are done.",
    inputSchema: z.object({ message: z.string(), recommendation: z.string() }),
    run: (args) => {
      closing = { message: args.message.trim(), recommendation: args.recommendation.trim() };
      return "Saved.";
    },
  });
  const { getDatapoints, getEntry } = recordTools(patientId);
  await runAgent({
    system: CLOSE,
    content: `Today is ${date}.\n${describeToday(today)}\nThe days just before, newest first: ${judgement.before.map((b) => `${b.date} ${b.combined}`).join(", ")}.\nYou asked: ${question}\nShe answered: ${answer.trim() || "(she skipped it)"}`,
    tools: [getDatapoints, getEntry, setClosing],
  });
  if (!closing) throw new Error("The agent finished without a closing");
  return closing;
}

/** How long, and how far down, in the record's own terms, for the stand-in's recommendation. */
function because(judgement: DayJudgement): string {
  const days = judgement.before.filter((b) => b.combined <= LOW_BEFORE).length + 1;
  return `${days === 2 ? "two bad check-ins in a row" : `${days} low check-ins in the last week`} (today ${wordFor("combined", judgement.todayCombined).toLowerCase()}, before that ${wordFor("combined", judgement.before[0]?.combined ?? null).toLowerCase()})`;
}

/** The close: what will be entered and, when warranted, the recommendation. On an ordinary day, no recommendation. */
export async function closeToday(patientId: string, date: string, today: Today, concern: boolean, exchange: { question: string | null; answer: string }): Promise<Closing> {
  const judgement = judgeDay(await getEntries(patientId), date, today.scores, concern);
  const entered = `I will enter this as today’s entry, ${formatDate(date)}.`;
  if (!judgement.recommend) return { message: `${entered}`, recommendation: null, madeBy: "dummy" };
  if (concern) {
    return {
      message: entered,
      recommendation: "You mentioned something that could be a wound or a sign of infection. Please contact the clinic about it; it is not something to treat at home. I can prepare a request from your record, and you read it before it goes.",
      madeBy: "dummy",
    };
  }
  if (hasKey() && exchange.question) {
    try {
      const done = await closeWithClaude(patientId, date, today, judgement, exchange.question, exchange.answer);
      return { ...done, madeBy: "claude" };
    } catch (error) {
      console.error("Reflect agent failed, using the stand-in", error);
    }
  }
  const said = exchange.answer.trim().replace(/[.!?]+$/, "");
  return {
    message: `${entered}${said ? ` I have noted what you said: “${said.slice(0, 160)}${said.length > 160 ? "…" : ""}”.` : ""}`,
    recommendation: `I also recommend that you make a report to the clinic. The record shows ${because(judgement)}, and a clinician can see you before it goes further. I prepare the report from your record; you read it first.`,
    madeBy: "dummy",
  };
}

