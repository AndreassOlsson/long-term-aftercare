import type { Scores } from "./metrics";

export type Entry = {
  id: string;
  patientId: string;
  /** The day the entry is about, YYYY-MM-DD in Swedish time. One entry per day. */
  date: string;
  createdAt: string;
  /** What the patient wrote or dictated, untouched. */
  text: string;
  /** Storage keys of the pictures; show them through /api/images?key=... */
  images: string[];
  scores: Scores;
  combined: number | null;
  /** One or two sentences from the analysis on why it scored this way. */
  rationale: string;
  followUp: { question: string; answer: string | null } | null;
  analyzedBy: "claude" | "dummy" | "seed";
  /** The case summary as it stood after this entry. */
  caseSummary: string | null;
};
