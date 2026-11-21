"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AssessmentSheet } from "./assessment-sheet";
import { Timeline } from "./timeline";
import { logout } from "@/lib/actions";
import { todaysQuestions } from "@/lib/assessment";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  const todaysEntry = entries.find((e) => e.date === today && e.analyzedBy !== "seed") ?? null;
  const doneToday = todaysEntry !== null;
  const shown = entries.slice(-Math.max(2, days));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-5">
      <h1 className="text-center text-xl font-semibold">Welcome back {firstName}</h1>
      {notice && (
        <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>
      )}

      <Timeline
        entries={shown}
        expanded={expanded}
        onExpandedChange={setExpanded}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        arrivingDate={arriving}
      >
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="rounded-xl border border-zinc-400 px-3 py-3 font-medium"
        >
          {doneToday ? "Update today's assessment" : "Do today's assessment"}
        </button>
        <label className="flex flex-col gap-1 text-sm text-zinc-600">
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

      <div className="mt-auto flex flex-col items-end gap-2">
        {settingsOpen && (
          <form action={logout.bind(null, "patient")} className="rounded-xl border border-zinc-300 p-3">
            <button className="underline">Log out</button>
          </form>
        )}
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label="Settings"
          aria-expanded={settingsOpen}
          className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-current"
        >
          <span className="block h-5 w-5 rounded-full border-2 border-current" />
        </button>
      </div>

      {sheetOpen && <AssessmentSheet existing={todaysEntry} questions={questions} onClose={() => setSheetOpen(false)} onSaved={saved} />}
    </main>
  );
}
