// The three things the analysis scores. Everything else (prompt, charts,
// combined score) reads this list, so changing the metrics means editing here.
// Every score runs from 1 to 5 and 5 is always the good end.
export const METRICS = [
  {
    key: "itchiness",
    label: "Itchiness",
    scale: "1 = constant, unbearable itch; 5 = no itch at all",
    keywords: ["itch", "scratch", "rash", "skin", "kli", "utslag", "hud"],
    /** What the patient reads, from score 1 to 5. Never the bare number. */
    words: ["Severe itching", "A lot of itching", "Some itching", "Hardly any itching", "No itching"],
    ends: ["Severe", "None"],
  },
  {
    key: "comfort",
    label: "Comfort",
    scale: "1 = painful or impossible to wear; 5 = completely comfortable",
    keywords: ["comfort", "pain", "hurt", "sore", "pressure", "rub", "fit", "ache", "ont", "skav", "bekväm", "tryck", "värk"],
    words: ["Painful to wear", "Uncomfortable", "Bearable", "Comfortable", "Completely comfortable"],
    ends: ["Painful", "Comfortable"],
  },
  {
    key: "mobility",
    label: "Perceived mobility",
    scale: "1 = can hardly move around; 5 = moves freely, as they want to",
    keywords: ["walk", "mov", "stairs", "run", "step", "mobil", "stand", "balance", "gå", "promenad", "trapp", "rörlig", "balans"],
    words: ["Hardly getting about", "Held back", "Getting by", "Moving well", "Moving freely"],
    ends: ["Held back", "Free"],
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

/** Her picks, cleaned: only whole numbers from 1 to 5 survive. */
export function cleanOwnScores(raw: Partial<Record<MetricKey, unknown>>): Partial<Scores> {
  const own: Partial<Scores> = {};
  for (const m of METRICS) {
    const value = raw[m.key];
    if (typeof value === "number" && Number.isInteger(value) && value >= SCORE_MIN && value <= SCORE_MAX) own[m.key] = value;
  }
  return own;
}

export const ownKeys = (own: Partial<Scores> | undefined) =>
  METRICS.filter((m) => own?.[m.key] != null).map((m) => m.key);

/** True when she picked every measure. */
export const scoredEverything = (own: Partial<Scores> | undefined) => ownKeys(own).length === METRICS.length;

export const missingMetrics = (scores: Scores) =>
  METRICS.filter((m) => scores[m.key] === null);

/** The combined figure, in words: how well the device is working for her. */
export const COMBINED = {
  label: "How well it is working",
  words: ["Not working for me", "Working badly", "Working so-so", "Working well", "Working very well"],
  ends: ["Badly", "Very well"],
};

/** A stored 1 to 5 score as the words the patient reads. */
export function wordFor(key: MetricKey | "combined", score: number | null): string {
  if (score === null) return "Not mentioned";
  const words = key === "combined" ? COMBINED.words : METRICS.find((m) => m.key === key)!.words;
  return words[Math.min(4, Math.max(0, Math.round(score) - 1))];
}

export const labelFor = (key: MetricKey | "combined") =>
  key === "combined" ? COMBINED.label : METRICS.find((m) => m.key === key)!.label;

type Row = { date: string; scores: Scores; combined: number | null };

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export type Change = {
  /** First day of the stretch that sits clearly below her own usual level. */
  since: string;
  /** The measures that moved, worst first, with her usual and recent level. */
  measures: { key: MetricKey; usual: number; recent: number }[];
  usualCombined: number;
  recentCombined: number;
  /** The days in the stretch. */
  dates: string[];
};

/**
 * A sustained change: her last three weeks sit clearly under her own usual
 * level (the months before that), on at least three separate days. A single
 * bad day never counts. Returns null when nothing like that is in the record.
 */
export function sustainedChange(rows: Row[], now: string): Change | null {
  const scored = rows.filter((r) => r.combined !== null && r.date <= now);
  const recent = scored.filter((r) => daysBetween(r.date, now) <= 21);
  const usualRows = scored.filter((r) => daysBetween(r.date, now) > 28 && daysBetween(r.date, now) <= 200);
  if (recent.length < 3 || usualRows.length < 4) return null;
  const usual = mean(usualRows.map((r) => r.combined as number)) as number;
  const low = recent.filter((r) => (r.combined as number) <= usual - 0.6);
  const now_ = mean(recent.map((r) => r.combined as number)) as number;
  if (low.length < 3 || now_ > usual - 0.8) return null;
  const measures = METRICS.map((m) => {
    const u = mean(usualRows.map((r) => r.scores[m.key]).filter((v): v is number => v !== null));
    const rc = mean(recent.map((r) => r.scores[m.key]).filter((v): v is number => v !== null));
    return { key: m.key, usual: u, recent: rc };
  })
    .filter((x): x is { key: MetricKey; usual: number; recent: number } => x.usual !== null && x.recent !== null && x.usual - x.recent >= 0.6)
    .sort((a, b) => b.usual - b.recent - (a.usual - a.recent));
  return {
    since: low[0].date,
    measures,
    usualCombined: Math.round(usual * 10) / 10,
    recentCombined: Math.round(now_ * 10) / 10,
    dates: low.map((r) => r.date),
  };
}

export type Lately = {
  /** Two or three plain sentences on how things have been. */
  sentences: string[];
  direction: "better" | "same" | "worse" | "unknown";
  daysSinceLast: number | null;
};

/** The home screen's account of how things have been lately, from the record alone. */
export function lately(rows: Row[], now: string): Lately {
  const scored = rows.filter((r) => r.combined !== null && r.date <= now);
  if (scored.length === 0) {
    return { sentences: ["There is nothing in your record yet. A first check-in starts it."], direction: "unknown", daysSinceLast: null };
  }
  const last = scored[scored.length - 1];
  const daysSinceLast = daysBetween(last.date, now);
  const recent = scored.filter((r) => daysBetween(r.date, now) <= 21);
  const before = scored.filter((r) => daysBetween(r.date, now) > 28 && daysBetween(r.date, now) <= 120);
  const r = mean(recent.map((x) => x.combined as number));
  const b = mean(before.map((x) => x.combined as number));
  const sentences: string[] = [];
  let direction: Lately["direction"] = "unknown";
  if (r !== null && b !== null) {
    const d = r - b;
    direction = d <= -0.6 ? "worse" : d >= 0.6 ? "better" : "same";
    sentences.push(
      direction === "worse"
        ? "The last few weeks have been harder than usual for you."
        : direction === "better"
          ? "The last few weeks have been better than usual for you."
          : "The last few weeks have been much like the months before.",
    );
    const moved = METRICS.map((m) => {
      const rv = mean(recent.map((x) => x.scores[m.key]).filter((v): v is number => v !== null));
      const bv = mean(before.map((x) => x.scores[m.key]).filter((v): v is number => v !== null));
      return { m, rv, bv, d: rv !== null && bv !== null ? rv - bv : 0 };
    }).sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
    if (moved && Math.abs(moved.d) >= 0.6 && moved.rv !== null && moved.bv !== null) {
      sentences.push(`${moved.m.label} has changed the most: it was mostly “${wordFor(moved.m.key, moved.bv).toLowerCase()}”, lately “${wordFor(moved.m.key, moved.rv).toLowerCase()}”.`);
    }
  } else if (r !== null) {
    sentences.push(`Lately it has been “${wordFor("combined", r).toLowerCase()}” for you.`);
  }
  sentences.push(
    daysSinceLast === 0
      ? "You have checked in today."
      : daysSinceLast === 1
        ? "Your last check-in was yesterday."
        : `Your last check-in was ${daysSinceLast} days ago.`,
  );
  return { sentences, direction, daysSinceLast };
}
