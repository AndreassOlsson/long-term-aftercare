"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AssessmentSheet } from "./assessment-sheet";
import { Timeline } from "./timeline";
import { logout } from "@/lib/actions";
import { todaysQuestions } from "@/lib/assessment";
import { formatLongDate } from "@/lib/dates";
import type { Entry } from "@/lib/types";

// How long the new point is shown on the combined graph before it splits
// into the three metrics.
const HOLD_MS = 900;

export function PatientHome({
  firstName,
  initialEntries,
  today,
  notice,
}: {
  firstName: string;
  initialEntries: Entry[];
  today: string;
  notice: string | null;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [selectedDate, setSelectedDate] = useState(
    initialEntries[initialEntries.length - 1]?.date ?? today,
  );
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [arriving, setArriving] = useState<string | null>(null);
  const [days, setDays] = useState(Math.min(30, initialEntries.length));

  // Today's targeted questions are prepared in the background as soon as the
  // home screen is open, so they are usually ready when the sheet is.
  const [questions, setQuestions] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    todaysQuestions()
      .then((set) => !cancelled && setQuestions(set?.questions ?? []))
      .catch(() => !cancelled && setQuestions([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!arriving) return;
    const hold = setTimeout(() => setExpanded(true), HOLD_MS);
    const done = setTimeout(() => setArriving(null), HOLD_MS + 2500);
    return () => {
      clearTimeout(hold);
      clearTimeout(done);
    };
  }, [arriving]);

  function saved(entry: Entry) {
    setEntries((current) =>
      [...current.filter((e) => e.date !== entry.date), entry].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    );
    setSheetOpen(false);
    setExpanded(false);
    setSelectedDate(entry.date);
    setArriving(entry.date);
    router.refresh();
  }

  const doneToday = entries.some((e) => e.date === today && e.analyzedBy !== "seed");
  const shown = entries.slice(-Math.max(2, days));
  const latest = [...entries].reverse().find((e) => e.combined !== null);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10 pt-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-slate">{formatLongDate(today)}</p>
          <h1 className="mt-1 text-[2rem] font-bold leading-tight tracking-[-0.01em]">Hello, {firstName}</h1>
        </div>
        <form action={logout.bind(null, "patient")}>
          <button className="mt-1 rounded-full px-3 py-2 text-slate underline-offset-4 hover:text-ink hover:underline">
            Log out
          </button>
        </form>
      </header>

      {notice && <p className="mt-5 rounded-lg bg-caution px-4 py-3 text-sm leading-relaxed">{notice}</p>}

      {/* While a day is open the day itself says this, so the room goes to the graph. */}
      <p hidden={expanded} className="mt-4 max-w-[32ch] text-lg leading-snug">
        {!latest
          ? "Your graph starts with your first entry."
          : doneToday && latest.date === today
            ? `Today's entry is in. It came to ${latest.combined!.toFixed(1)} of 5.`
            : `Your last entry, ${formatLongDate(latest.date)}, came to ${latest.combined!.toFixed(1)} of 5.`}
      </p>

      <div className="mt-6">
        <Timeline
          entries={shown}
          expanded={expanded}
          onExpandedChange={setExpanded}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          arrivingDate={arriving}
        >
          <p className="-mt-2 text-[15px] text-slate">Tap the graph to open a day, then slide along it.</p>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex items-center justify-center gap-3 rounded-2xl bg-ink px-5 py-4 text-lg font-semibold text-paper hover:bg-ink-soft"
          >
            <PenIcon />
            {doneToday ? "Change today's entry" : "Write today's entry"}
          </button>
          <label className="mt-2 flex flex-col gap-2 text-slate">
            Showing the last {shown.length} days
            <input
              type="range"
              min={7}
              max={Math.max(7, entries.length)}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
          </label>
        </Timeline>
      </div>

      {sheetOpen && <AssessmentSheet questions={questions} onClose={() => setSheetOpen(false)} onSaved={saved} />}
    </main>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}
