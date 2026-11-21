import { addDays, today } from "./dates";
import { clampScore, combine, type Scores } from "./metrics";
import type { Entry } from "./types";

// Made-up history for the mock patient, so the graphs have something to show
// before anyone has entered anything. It always ends yesterday. An entry the
// patient really saves for a day replaces the made-up one for that day.

const DAYS = 42;

const NOTES: Record<number, string> = {
  41: "First week with the new socket. Feels snug, a little strange but fine.",
  33: "Walked to the shop and back without stopping. No itching today.",
  26: "Some itching under the liner in the evening after a long day at work.",
  19: "Good day. Took the stairs at the station, forgot about the leg for a while.",
  12: "The socket has started to rub on the outside of the knee. Red mark when I take it off.",
  8: "Rubbing is worse. I shortened my walk because of it.",
  5: "Skin is irritated and itchy where it rubs. Using it less at home.",
  3: "Painful to wear for more than a couple of hours. Skipped my evening walk.",
  1: "Still sore. I think the fit has changed, it feels looser than before.",
};

export function seedEntries(patientId: string): Entry[] {
  const end = today();
  const entries: Entry[] = [];
  for (let ago = DAYS; ago >= 1; ago--) {
    const wobble = (phase: number) => Math.sin(ago * 1.3 + phase) * 0.35;
    // Things go well for a month, then the fit starts to fail.
    const decline = ago < 14 ? (14 - ago) / 14 : 0;
    const scores: Scores = {
      itchiness: clampScore(4.3 - (ago > 22 && ago < 29 ? 1.2 : 0) - decline * 1.8 + wobble(0)),
      comfort: clampScore(4.2 - decline * 2.9 + wobble(2)),
      mobility: clampScore(3.9 + (ago < 30 ? 0.4 : 0) - decline * 1.9 + wobble(4)),
    };
    const date = addDays(end, -ago);
    entries.push({
      id: `seed-${date}`,
      patientId,
      date,
      createdAt: `${date}T18:00:00.000Z`,
      text: NOTES[ago] ?? "",
      images: [],
      scores,
      combined: combine(scores),
      rationale: "",
      followUp: null,
      analyzedBy: "seed",
      caseSummary: null,
    });
  }
  return entries;
}

export const SEED_SUMMARY =
  "Maria did well for the first month with the new socket: comfort and mobility were steady and itching was occasional. Over the last two weeks all three have fallen together. She describes rubbing on the outside of the knee, irritated skin where it rubs, and a fit that feels looser than before, and she has started to shorten walks and wear the prosthesis less. (This is made-up example history.)";
