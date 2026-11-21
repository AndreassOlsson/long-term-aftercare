import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { addDays, today } from "./dates";
import { getEntries } from "./entries";
import { hasKey, runAgent } from "./agents/run";
import { CONTACT_CLINIC, mentionsWoundOrInfection } from "./agents/safety";
import { metricGuide, recordTools } from "./agents/tools";
import { getObject, putObject } from "./storage";
import type { Entry } from "./types";

// Things the patient can do: everyday self-care drawn from her own record,
// each with the reason and the days it rests on. Wounds and signs of
// infection are never answered here; see agents/safety.ts.

export type Suggestion = {
  id: string;
  title: string;
  /** What to do, in a sentence or two. */
  advice: string;
  /** Why, in terms of her own record. */
  reason: string;
  /** The days (YYYY-MM-DD) the suggestion rests on. */
  dates: string[];
};

export type SuggestionSet = {
  /** Changes whenever the record does, so a stale set is rebuilt. */
  signature: string;
  createdAt: string;
  suggestions: Suggestion[];
  madeBy: "claude" | "dummy";
  /** Set instead of suggestions when a recent entry mentions a wound or infection. */
  contactClinic: string | null;
};

const MAX = 3;
const key = (patientId: string) => `patients/${patientId}/suggestions.json`;

function recentFlagged(entries: Entry[], now: string): boolean {
  const since = addDays(now, -21);
  return entries.some(
    (e) =>
      e.date >= since &&
      (e.safetyFlag || mentionsWoundOrInfection(`${e.text} ${e.followUp?.answer ?? ""}`)),
  );
}

const mentions = (entries: Entry[], pattern: RegExp) =>
  entries.filter((e) => e.text && pattern.test(e.text)).map((e) => e.date);

/** Stand-in without a key: reads her own words for a few recurring patterns. */
export function suggestFromRecord(entries: Entry[], now: string): Suggestion[] {
  const recent = entries.filter((e) => e.date >= addDays(now, -60));
  const out: Suggestion[] = [];
  const longDays = mentions(recent, /\b(long (walk|day)|walk|walked|stairs|on my feet|hours)\b/i);
  const itchDays = mentions(recent, /\b(itch|itchy|warm|hot)\b/i);
  const both = longDays.filter((d) => itchDays.includes(d));
  if (both.length >= 1 || itchDays.length >= 2) {
    const dates = (both.length ? both : itchDays).slice(-4);
    out.push({
      id: "cool-on-long-days",
      title: "Pack something to rest and cool your skin on long days",
      advice: "On days when you will be on your feet for a long time, bring a way to take the liner off for a while and let the skin cool, and a clean dry cloth.",
      reason: "The itching in your own notes comes on after long walks and long days, when the skin has been warm for hours.",
      dates,
    });
  }
  const rubDays = mentions(recent, /\b(rub|rubbing|rubbed|red mark|irritat|sore|painful)\b/i);
  if (rubDays.length >= 1) {
    out.push({
      id: "skin-check",
      title: "Look at your skin morning and evening",
      advice: "When you take the prosthesis off, look at the skin where it rubs and note whether the mark has faded by the next morning. Give the skin a break between long stretches of wear.",
      reason: "You have written about rubbing and irritated skin, and noticing how quickly it fades is something you can do yourself and tell the clinic.",
      dates: rubDays.slice(-4),
    });
  }
  const walkCut = mentions(recent, /\b(shortened|skipped|using it less|took a longer break|break)\b/i);
  if (walkCut.length >= 1) {
    out.push({
      id: "shorter-walks",
      title: "Split long walks into shorter ones with breaks",
      advice: "Two shorter walks with a rest in between keep you moving without the long stretch of wear that seems to set it off.",
      reason: "You have been cutting walks short or skipping them, and it sounds like the long ones are what bring it on.",
      dates: walkCut.slice(-4),
    });
  }
  const loose = mentions(recent, /\b(loose|looser|fit has changed|feels different)\b/i);
  if (loose.length >= 1) {
    out.push({
      id: "note-the-fit",
      title: "Write down when the fit feels different",
      advice: "Make a note when it feels looser or tighter, and at what time of day. It costs nothing and it is the first thing the clinic will ask.",
      reason: "You wrote that the fit has changed. The pattern over the day is hard to remember afterwards.",
      dates: loose.slice(-3),
    });
  }
  return out.slice(0, MAX);
}

const SYSTEM = `You suggest everyday self-care to a patient with an orthosis or prosthesis, drawn from their own record. You are not a clinician: only ordinary things a person can do on their own, such as pacing walks, resting and cooling the skin, looking at the skin, writing down when something happens. Never advise on fit adjustments, medication, dressings, treating skin damage, or anything that needs a clinician.

Their scores are 1 to 5, 5 the good end:
${metricGuide}

Look at the record with the tools: the datapoints, and their own words on the days that stand out. Find patterns in THEIR record, for example more irritation in the weeks they walked a lot. Each suggestion needs: a short title, the advice in one or two plain sentences, the reason in terms of what their own record shows, and the days (YYYY-MM-DD) the suggestion rests on, which must be days that exist in the record. One to ${MAX} suggestions. If the record shows nothing worth suggesting, say so with an empty list. Write for an older, non-technical reader, warmly and plainly, in the language the patient writes in.

If any entry mentions a wound, an open sore, signs of infection (swelling, heat, pus, fever, smell) or bleeding, give NO suggestions: return an empty list. That case is handled elsewhere.

When done, call set_suggestions exactly once.`;

async function suggestWithClaude(patientId: string, now: string): Promise<Suggestion[]> {
  let chosen: { title: string; advice: string; reason: string; dates: string[] }[] | null = null;
  const setSuggestions = betaZodTool({
    name: "set_suggestions",
    description: "Hand in the suggestions. Call this exactly once, when you are done.",
    inputSchema: z.object({
      suggestions: z.array(
        z.object({ title: z.string(), advice: z.string(), reason: z.string(), dates: z.array(z.string()) }),
      ),
    }),
    run: (args) => {
      chosen = args.suggestions;
      return "Saved.";
    },
  });
  const { getDatapoints, getEntry } = recordTools(patientId);
  await runAgent({
    system: SYSTEM,
    content: `Today is ${now}. Suggest what this patient can do, from their record.`,
    tools: [getDatapoints, getEntry, setSuggestions],
  });
  const result = chosen as { title: string; advice: string; reason: string; dates: string[] }[] | null;
  if (!result) throw new Error("The agent finished without suggestions");
  return result.slice(0, MAX).map((s, i) => ({
    id: `s${i}`,
    title: s.title.trim(),
    advice: s.advice.trim(),
    reason: s.reason.trim(),
    dates: s.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  }));
}

const signatureOf = (entries: Entry[]) => {
  const last = entries[entries.length - 1];
  return `${entries.length}:${last?.date ?? ""}:${last?.id ?? ""}:${hasKey() ? "k" : "n"}`;
};

/** The patient's suggestions, rebuilt when the record has changed since last time. */
export async function getSuggestions(patientId: string): Promise<SuggestionSet> {
  const now = today();
  const entries = await getEntries(patientId);
  const signature = signatureOf(entries);
  const cached = await getObject(key(patientId), { fresh: true });
  if (cached) {
    const set = JSON.parse(cached.body.toString("utf8")) as SuggestionSet;
    if (set.signature === signature) return set;
  }
  let suggestions: Suggestion[] = [];
  let madeBy: SuggestionSet["madeBy"] = "dummy";
  let contactClinic: string | null = null;
  if (recentFlagged(entries, now)) {
    // The rule lives here, in code: no advice at all, whatever any agent would say.
    contactClinic = CONTACT_CLINIC;
  } else {
    let done = false;
    if (hasKey()) {
      try {
        suggestions = await suggestWithClaude(patientId, now);
        madeBy = "claude";
        done = true;
      } catch (error) {
        console.error("Suggestion agent failed, using the stand-in", error);
      }
    }
    if (!done) suggestions = suggestFromRecord(entries, now);
    // Whatever wrote them, a suggestion that touches a wound never goes out.
    suggestions = suggestions.filter((s) => !mentionsWoundOrInfection(`${s.title} ${s.advice}`));
  }
  const set: SuggestionSet = { signature, createdAt: new Date().toISOString(), suggestions, madeBy, contactClinic };
  await putObject(key(patientId), JSON.stringify(set, null, 2), "application/json");
  return set;
}
