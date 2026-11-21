import { addDays } from "@/lib/dates";
import { METRICS, type MetricKey } from "@/lib/metrics";
import type { Entry } from "@/lib/types";
import { fmtScore, shortDate } from "./format";

// What the clinician's screens say about a record, worked out from the
// entries alone. It reports how the patient's own figures moved; it does not
// say what the cause is.

export type SeriesKey = MetricKey | "combined";

export const SERIES: { key: SeriesKey; label: string; scale: string }[] = [
  {
    key: "combined",
    label: "Combined",
    scale: "The mean of the three measures. 1 = worst, 5 = best.",
  },
  ...METRICS.map((m) => ({ key: m.key as SeriesKey, label: m.label, scale: m.scale })),
];

export const valueOf = (entry: Entry, key: SeriesKey): number | null =>
  key === "combined" ? entry.combined : entry.scores[key];

export type Change = {
  key: SeriesKey;
  label: string;
  /** The patient's usual level before the change. */
  baseline: number | null;
  /** Where it stands now: the mean of the latest few days. */
  now: number | null;
  nowDate: string | null;
  delta: number | null;
  lowest: { value: number; date: string } | null;
  /** The first day of the current stretch below the usual level, if there is one. */
  since: string | null;
};

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** How one series has moved, using entries up to and including `upTo`. */
export function changeOf(entries: Entry[], key: SeriesKey, upTo?: string): Change {
  const label = SERIES.find((s) => s.key === key)?.label ?? key;
  const points = entries
    .filter((e) => (!upTo || e.date <= upTo) && valueOf(e, key) !== null)
    .map((e) => ({ date: e.date, value: valueOf(e, key) as number }));
  const empty: Change = { key, label, baseline: null, now: null, nowDate: null, delta: null, lowest: null, since: null };
  if (points.length === 0) return empty;

  const end = points[points.length - 1].date;
  const window = points.filter((p) => p.date >= addDays(end, -56) && p.date <= addDays(end, -21));
  const early = window.length >= 3 ? window : points.slice(0, Math.min(7, points.length));
  const baseline = mean(early.map((p) => p.value));
  const latest = points.slice(-3);
  const now = mean(latest.map((p) => p.value));

  // Walk back from the end while the three-day mean stays clearly under the
  // usual level; the stretch's first day is where the change began.
  let since: string | null = null;
  if (baseline - now >= 0.5) {
    let startIndex = points.length - 1;
    for (let i = points.length - 1; i >= 0; i--) {
      const trailing = points.slice(Math.max(0, i - 2), i + 1).map((p) => p.value);
      if (baseline - mean(trailing) < 0.5) break;
      startIndex = i;
    }
    since = points[startIndex].date;
  }

  let lowest = points[0];
  for (const p of points) if (p.value < lowest.value) lowest = p;
  const recent = points.filter((p) => p.date >= addDays(end, -56));
  let recentLowest = recent[0] ?? lowest;
  for (const p of recent) if (p.value < recentLowest.value) recentLowest = p;

  return {
    key,
    label,
    baseline,
    now,
    nowDate: end,
    delta: now - baseline,
    lowest: recentLowest,
    since,
  };
}

export function allChanges(entries: Entry[], upTo?: string): Change[] {
  return SERIES.map((s) => changeOf(entries, s.key, upTo));
}

/** "Comfort fell from 4.2 to 1.4 since 29 Oct": one measure in a sentence. */
export function describeChange(c: Change): string {
  if (c.now === null || c.baseline === null) return `${c.label}: no scores yet.`;
  if (c.since) {
    return `${c.label} is down from its usual ${fmtScore(c.baseline)} to ${fmtScore(c.now)}, lower since ${shortDate(c.since)}.`;
  }
  const delta = c.now - c.baseline;
  if (Math.abs(delta) < 0.5) return `${c.label} is steady at ${fmtScore(c.now)}.`;
  return `${c.label} is ${delta > 0 ? "up" : "down"} from ${fmtScore(c.baseline)} to ${fmtScore(c.now)}.`;
}

/** The one line the inbox shows for a patient. */
export function reasonLine(entries: Entry[]): { text: string; tone: "alert" | "warn" | "neutral" } {
  if (entries.length === 0) return { text: "No check-ins yet.", tone: "neutral" };
  const combined = changeOf(entries, "combined");
  if (combined.since && combined.now !== null && combined.baseline !== null) {
    const worst = [...allChanges(entries)]
      .filter((c) => c.key !== "combined" && c.delta !== null)
      .sort((a, b) => (a.delta as number) - (b.delta as number))[0];
    return {
      text: `Combined figure ${fmtScore(combined.now)}, down from ${fmtScore(combined.baseline)}; lower since ${shortDate(combined.since)}. Biggest fall: ${worst.label.toLowerCase()}.`,
      tone: combined.now < 2.5 ? "alert" : "warn",
    };
  }
  return { text: `Steady: combined figure ${fmtScore(combined.now)}.`, tone: "neutral" };
}

/** Days with something the patient wrote or a picture, newest last. */
export const daysWithWords = (entries: Entry[]) =>
  entries.filter((e) => e.text.trim() || e.images.length > 0);
