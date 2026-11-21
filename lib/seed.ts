import { addDays, today } from "./dates";
import { clampScore, combine, type Scores } from "./metrics";
import type { Entry } from "./types";

// Made-up history for the mock patient, so the graphs have something to show
// before anyone has entered anything. It always ends yesterday. An entry the
// patient really saves for a day replaces the made-up one for that day.

// Three years of weekly check-ins, a long good stretch, then a few weeks
// where the fit goes and things slide. Deterministic: the same every run.
const YEARS_BACK = 1100;
const SLIDE_DAYS = 28;

const NOTES: Record<number, string> = {
  1090: "First week with the new socket. Feels snug, a little strange but fine.",
  1030: "Walked to the shop and back without stopping. No itching today.",
  900: "Back at work full days. Some itching under the liner in the evenings, nothing worse than that.",
  760: "A year and a half in and I mostly forget about it. Good day.",
  640: "Hot week. The liner itched in the afternoons, better once I took it off for a while.",
  520: "Took the stairs at the station without thinking about it.",
  400: "Long walk with my sister, about two hours. Tired but no rubbing.",
  300: "Check-up went well. The clinic said the fit looks right.",
  190: "Some itching after the weekend away, gone in a couple of days.",
  95: "Good stretch. Walking every morning before work.",
  60: "Nothing to report, which is the best kind of day.",
  30: "Walked to the shop and back without stopping. No itching today.",
  26: "Some itching under the liner in the evening after a long day at work.",
  19: "Good day. Took the stairs at the station, forgot about the leg for a while.",
  15: "Went out for a long walk with a friend, a bit over two hours. My skin was warm and itchy by the end.",
  12: "The socket has started to rub on the outside of the knee. Red mark when I take it off.",
  9: "Rubbing again on the walk home. I took a longer break than usual.",
  8: "Rubbing is worse. I shortened my walk because of it.",
  5: "Skin is irritated and itchy where it rubs. Using it less at home.",
  3: "Painful to wear for more than a couple of hours. Skipped my evening walk.",
  1: "Still sore. I think the fit has changed, it feels looser than before.",
};

const PICTURES: Record<number, string> = {
  1090: "seed-fit",
  12: "seed-mark",
  5: "seed-rub",
  1: "seed-sore",
};

/** The days she checked in: about weekly, and more often once things slide. */
function checkInDays(): number[] {
  const days: number[] = [];
  let ago = 1;
  while (ago <= YEARS_BACK) {
    days.push(ago);
    if (ago <= SLIDE_DAYS + 14) ago += 2 + (ago % 3 === 0 ? 1 : 0);
    else ago += 6 + ((ago * 7) % 3);
  }
  for (const key of Object.keys(NOTES)) if (!days.includes(Number(key))) days.push(Number(key));
  return days.sort((a, b) => b - a);
}

export function seedEntries(patientId: string): Entry[] {
  const end = today();
  const entries: Entry[] = [];
  for (const ago of checkInDays()) {
    // Day-to-day noise from a fixed hash (never random) plus a slow swell, so the line reads as a life.
    const noise = (phase: number) => ((Math.sin((ago + phase) * 12.9898) * 43758.5453) % 1 + 1) % 1 - 0.5;
    const wobble = (phase: number) => noise(phase) * 0.5 + Math.sin(ago * 0.06 + phase) * 0.25;
    // A long good stretch, a small dip around two years in, then the slide.
    const decline = ago < 21 ? (21 - ago) / 21 : 0;
    const dip = ago > 380 && ago < 410 ? 0.6 : 0;
    const scores: Scores = {
      itchiness: clampScore(4.3 - (ago > 22 && ago < 29 ? 1.0 : 0) - dip - decline * 1.7 + wobble(0)),
      comfort: clampScore(4.2 - dip * 0.5 - decline * 2.8 + wobble(2)),
      mobility: clampScore(4.0 - (ago > 900 ? 0.4 : 0) - decline * 1.8 + wobble(4)),
    };
    const date = addDays(end, -ago);
    const picture = PICTURES[ago];
    entries.push({
      id: `seed-${date}`,
      patientId,
      date,
      createdAt: `${date}T18:00:00.000Z`,
      text: NOTES[ago] ?? "",
      images: picture ? [`patients/${patientId}/images/${picture}.jpg`] : [],
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
