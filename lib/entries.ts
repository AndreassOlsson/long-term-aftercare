import { SEED_SUMMARY, seedEntries } from "./seed";
import { getObject, listKeys, putObject } from "./storage";
import type { Entry } from "./types";

const entryPrefix = (patientId: string) => `patients/${patientId}/entries/`;
export const imagePrefix = (patientId: string) => `patients/${patientId}/images/`;

async function storedEntries(patientId: string): Promise<Entry[]> {
  const keys = await listKeys(entryPrefix(patientId));
  const objects = await Promise.all(keys.map((key) => getObject(key)));
  return objects
    .filter((o) => o !== null)
    .map((o) => JSON.parse(o.body.toString("utf8")) as Entry);
}

/** One entry per day, oldest first: the made-up history plus what was saved. */
export async function getEntries(patientId: string): Promise<Entry[]> {
  const byDate = new Map<string, Entry>();
  for (const entry of seedEntries(patientId)) byDate.set(entry.date, entry);
  const stored = (await storedEntries(patientId)).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  // Later saves for the same day win.
  for (const entry of stored) byDate.set(entry.date, entry);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
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
