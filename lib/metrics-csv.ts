import { METRICS, combine, emptyScores, type Scores } from "./metrics";
import { seedEntries } from "./seed";
import { getObject, putObject } from "./storage";

// The finalized metrics, one row per day, as a CSV file per patient. This is
// what the graphs draw and what both agents read. Until the first real entry
// is saved the file does not exist and the made-up history stands in for it;
// the first save writes that history out together with the new row.

export type MetricRow = { date: string; scores: Scores; combined: number | null };

const HEADER = ["date", ...METRICS.map((m) => m.key), "combined"];
const csvKey = (patientId: string) => `patients/${patientId}/metrics.csv`;
const cell = (v: number | null) => (v === null ? "" : v.toFixed(1));
const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

export function toCsv(rows: MetricRow[]): string {
  const lines = rows.map((row) =>
    [row.date, ...METRICS.map((m) => cell(row.scores[m.key])), cell(row.combined)].join(","),
  );
  return [HEADER.join(","), ...lines].join("\n") + "\n";
}

function fromCsv(csv: string): MetricRow[] {
  const [header, ...lines] = csv.trim().split("\n");
  const columns = header.split(",");
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const cells = line.split(",");
      const at = (name: string) => cells[columns.indexOf(name)];
      const scores = emptyScores();
      for (const m of METRICS) scores[m.key] = num(at(m.key));
      return { date: at("date"), scores, combined: num(at("combined")) };
    });
}

export async function readMetrics(patientId: string): Promise<MetricRow[]> {
  const file = await getObject(csvKey(patientId), { fresh: true });
  if (file) return fromCsv(file.body.toString("utf8"));
  return seedEntries(patientId).map((e) => ({
    date: e.date,
    scores: e.scores,
    combined: e.combined,
  }));
}

/** Adds the day's row, replacing an earlier row for the same day. */
export async function recordMetrics(patientId: string, date: string, scores: Scores): Promise<void> {
  const rows = (await readMetrics(patientId)).filter((row) => row.date !== date);
  rows.push({ date, scores, combined: combine(scores) });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  await putObject(csvKey(patientId), toCsv(rows), "text/csv");
}
