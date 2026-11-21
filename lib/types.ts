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
  /** Read from the metrics CSV, which is where the finalized scores live. */
  scores: Scores;
  combined: number | null;
  /** One or two sentences from the analysis on why it scored this way. */
  rationale: string;
  /** The targeted questions the patient was shown that day. */
  questions?: string[];
  followUp: { question: string; answer: string | null } | null;
  /** "patient" when she scored what could be scored and there was nothing for the analysis to read. */
  analyzedBy: "claude" | "dummy" | "seed" | "patient";
  /** The measures the patient picked herself (whole numbers 1 to 5). In `scores` they stand exactly as picked. */
  ownScores?: Partial<Scores>;
  /** The case summary as it stood after this entry. */
  caseSummary: string | null;
  /** The entry mentions a wound or signs of infection; the patient was told to contact the clinic. */
  safetyFlag?: boolean;
};

/** The targeted questions prepared for one day's assessment. */
export type QuestionSet = {
  id: string;
  patientId: string;
  date: string;
  createdAt: string;
  questions: string[];
  /** Why these, in a sentence: what in the record they come from. */
  basedOn: string;
  askedBy: "claude" | "dummy";
};
