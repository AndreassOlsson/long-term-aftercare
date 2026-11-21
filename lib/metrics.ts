// The three things the analysis scores. Everything else (prompt, charts,
// combined score) reads this list, so changing the metrics means editing here.
// Every score runs from 1 to 5 and 5 is always the good end.
export const METRICS = [
  {
    key: "itchiness",
    label: "Itchiness",
    scale: "1 = constant, unbearable itch; 5 = no itch at all",
    keywords: ["itch", "scratch", "rash", "skin", "kli", "utslag", "hud"],
  },
  {
    key: "comfort",
    label: "Comfort",
    scale: "1 = painful or impossible to wear; 5 = completely comfortable",
    keywords: ["comfort", "pain", "hurt", "sore", "pressure", "rub", "fit", "ache", "ont", "skav", "bekväm", "tryck", "värk"],
  },
  {
    key: "mobility",
    label: "Perceived mobility",
    scale: "1 = can hardly move around; 5 = moves freely, as they want to",
    keywords: ["walk", "mov", "stairs", "run", "step", "mobil", "stand", "balance", "gå", "promenad", "trapp", "rörlig", "balans"],
  },
] as const;

export type MetricKey = (typeof METRICS)[number]["key"];
export type Scores = Record<MetricKey, number | null>;

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

export const emptyScores = (): Scores =>
  Object.fromEntries(METRICS.map((m) => [m.key, null])) as Scores;

export function clampScore(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(value * 10) / 10));
}

/** The combined score: the plain mean of the metrics that have a value. */
export function combine(scores: Scores): number | null {
  const values = METRICS.map((m) => scores[m.key]).filter(
    (v): v is number => v !== null,
  );
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export const missingMetrics = (scores: Scores) =>
  METRICS.filter((m) => scores[m.key] === null);
