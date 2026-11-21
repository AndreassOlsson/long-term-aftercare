import { readMetrics } from "./metrics-csv";
import { SEED_SUMMARY, seedEntries } from "./seed";
import { getObject, listKeys, putObject } from "./storage";
import type { Entry, QuestionSet } from "./types";

// What the patient entered (text, pictures, the questions they were shown)
// is kept as one small file per entry. The scores are kept apart, in the
// metrics CSV; getEntries joins the two by day.

const entryPrefix = (patientId: string) => `patients/${patientId}/entries/`;
const questionPrefix = (patientId: string) => `patients/${patientId}/questions/`;
export const imagePrefix = (patientId: string) => `patients/${patientId}/images/`;

async function readAll<T>(prefix: string): Promise<T[]> {
  const keys = await listKeys(prefix);
  const objects = await Promise.all(keys.map((key) => getObject(key)));
  return objects
    .filter((o) => o !== null)
    .map((o) => JSON.parse(o.body.toString("utf8")) as T);
}

const byCreated = <T extends { createdAt: string }>(items: T[]) =>
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** One entry per day that has a row in the metrics CSV, oldest first. */
export async function getEntries(patientId: string): Promise<Entry[]> {
  const notes = new Map<string, Entry>();
  for (const entry of seedEntries(patientId)) notes.set(entry.date, entry);
  // Later saves for the same day win.
  for (const entry of byCreated(await readAll<Entry>(entryPrefix(patientId)))) {
    notes.set(entry.date, entry);
  }
  return (await readMetrics(patientId)).map((row) => {
    const note = notes.get(row.date);
    return {
      ...(note ?? {
        id: `row-${row.date}`,
        patientId,
        date: row.date,
        createdAt: `${row.date}T18:00:00.000Z`,
        text: "",
        images: [],
        rationale: "",
        followUp: null,
        analyzedBy: "seed" as const,
        caseSummary: null,
      }),
      scores: row.scores,
      combined: row.combined,
    };
  });
}

export async function saveEntry(entry: Entry): Promise<void> {
  // A new file per save, never an overwrite, so a read is never stale.
  await putObject(
    `${entryPrefix(entry.patientId)}${entry.date}-${entry.id}.json`,
    JSON.stringify(entry, null, 2),
    "application/json",
  );
}

export function latestSummary(entries: Entry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].caseSummary) return entries[i].caseSummary as string;
  }
  return SEED_SUMMARY;
}

/** Every set of targeted questions that has been prepared, oldest first. */
export async function getQuestionSets(patientId: string): Promise<QuestionSet[]> {
  return byCreated(await readAll<QuestionSet>(questionPrefix(patientId)));
}

export async function saveQuestionSet(set: QuestionSet): Promise<void> {
  await putObject(
    `${questionPrefix(set.patientId)}${set.date}-${set.id}.json`,
    JSON.stringify(set, null, 2),
    "application/json",
  );
}
