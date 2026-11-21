"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { METRICS, ownKeys, scoredEverything } from "@/lib/metrics";
import type { Entry } from "@/lib/types";
import { SERIES, valueOf } from "./case";
import { fmtScore, longDate } from "./format";

// Every date on the clinician's screens is a DayLink. It opens that day from
// the record in a side panel, so nothing the screens say is more than one
// click from the entry it rests on.

type DayContext = { open: (date: string) => void };
const Ctx = createContext<DayContext>({ open: () => {} });

export function DayProvider({ entries, children }: { entries: Entry[]; children: React.ReactNode }) {
  const [date, setDate] = useState<string | null>(null);
  const open = useCallback((d: string) => setDate(d), []);
  const value = useMemo(() => ({ open }), [open]);
  const index = date ? entries.findIndex((e) => e.date === date) : -1;
  const entry = index >= 0 ? entries[index] : null;

  useEffect(() => {
    if (!date) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDate(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [date]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {date && (
        <aside
          role="dialog"
          aria-label={`Day ${date}`}
          className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-xl"
        >
          <header className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
            <div>
              <p className="text-xs text-muted">From the patient&apos;s record</p>
              <h2 className="text-lg font-semibold">{longDate(date)}</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label="Previous day with an entry"
                disabled={index <= 0}
                onClick={() => setDate(entries[index - 1].date)}
                className="rounded-lg px-2 py-1 text-muted hover:bg-page disabled:opacity-30"
              >
                ←
              </button>
              <button
                aria-label="Next day with an entry"
                disabled={index < 0 || index >= entries.length - 1}
                onClick={() => setDate(entries[index + 1].date)}
                className="rounded-lg px-2 py-1 text-muted hover:bg-page disabled:opacity-30"
              >
                →
              </button>
              <button
                aria-label="Close"
                onClick={() => setDate(null)}
                className="ml-1 rounded-lg px-2 py-1 text-muted hover:bg-page"
              >
                ✕
              </button>
            </div>
          </header>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {entry ? <DayBody entry={entry} /> : <p className="text-muted">There is no entry for this day.</p>}
          </div>
        </aside>
      )}
    </Ctx.Provider>
  );
}

function DayBody({ entry }: { entry: Entry }) {
  const everything = scoredEverything(entry.ownScores);
  return (
    <>
      <section>
        <h3 className="mb-2 text-sm font-medium text-muted">Figures (5 is the good end)</h3>
        {everything && <p className="mb-2 text-sm font-medium">Scored by the patient.</p>}
        <ul className="space-y-2">
          {SERIES.map((s) => {
            const v = valueOf(entry, s.key);
            return (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <span className={`w-36 shrink-0 ${s.key === "combined" ? "font-medium" : ""}`}>
                  {s.label}
                  {s.key !== "combined" && entry.ownScores?.[s.key] != null && (
                    <span className="block text-xs font-normal text-muted" data-own={s.key}>
                      picked by the patient
                    </span>
                  )}
                </span>
                <span className="h-2 flex-1 rounded-full bg-page">
                  <span
                    className="block h-2 rounded-full bg-accent"
                    style={{ width: `${v === null ? 0 : ((v - 1) / 4) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right tabular-nums">{fmtScore(v)}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">
          {METRICS.map((m) => `${m.label}: ${m.scale}`).join(". ")}.
        </p>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-medium text-muted">In the patient&apos;s words</h3>
        {entry.text.trim() ? (
          <blockquote className="border-l-2 border-line pl-3 whitespace-pre-wrap">{entry.text}</blockquote>
        ) : (
          <p className="text-muted">She wrote nothing this day; only the figures were recorded.</p>
        )}
        {entry.followUp?.answer && (
          <p className="mt-2 text-sm text-muted">
            Asked &ldquo;{entry.followUp.question}&rdquo; and answered: {entry.followUp.answer}
          </p>
        )}
      </section>
      {entry.images.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-muted">Pictures</h3>
          <div className="grid grid-cols-2 gap-2">
            {entry.images.map((key) => (
              // eslint-disable-next-line @next/next/no-img-element -- private, served through our own route
              <img key={key} src={`/api/images?key=${encodeURIComponent(key)}`} alt={`Picture from ${entry.date}`} className="rounded-lg border border-line" />
            ))}
          </div>
        </section>
      )}
      {entry.rationale && (
        <section>
          <h3 className="mb-1 text-sm font-medium text-muted">How the figures were read</h3>
          <p className="text-sm">{entry.rationale}</p>
          <p className="mt-1 text-xs text-muted">
            {entry.analyzedBy === "patient" ? "Scored by the patient." : <>Read out of what she wrote by {entry.analyzedBy === "claude" ? "the AI analysis" : entry.analyzedBy === "dummy" ? "the keyword stand-in" : "made-up history"}{ownKeys(entry.ownScores).length ? ", apart from the figures she picked herself" : ""}.</>}
          </p>
        </section>
      )}
    </>
  );
}

export function DayLink({
  date,
  children,
  className = "",
}: {
  date: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { open } = useContext(Ctx);
  return (
    <button
      type="button"
      onClick={() => open(date)}
      data-day={date}
      className={`rounded px-1 text-accent underline decoration-dotted underline-offset-4 hover:bg-accent-soft ${className}`}
    >
      {children ?? longDate(date)}
    </button>
  );
}

export const useOpenDay = () => useContext(Ctx).open;
