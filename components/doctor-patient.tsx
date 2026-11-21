"use client";

import { useState } from "react";
import { METRIC_COLOR } from "./metric-colors";
import { Timeline } from "./timeline";
import { formatLongDate } from "@/lib/dates";
import { METRICS } from "@/lib/metrics";
import type { Entry } from "@/lib/types";

export function DoctorPatient({
  name,
  entries,
  summary,
}: {
  name: string;
  entries: Entry[];
  summary: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState(entries[entries.length - 1]?.date ?? "");
  const last = entries[entries.length - 1];
  const written = entries.filter((e) => e.analyzedBy !== "seed").length;

  return (
    <div className="flex max-w-7xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div>
          <h1 className="text-[2rem] font-bold leading-tight tracking-[-0.01em]">{name}</h1>
          <p className="mt-1 text-slate">
            {last
              ? `${entries.length} days on record. Last entry ${formatLongDate(last.date)}.`
              : "No entries yet."}
            {written > 0 && ` ${written} written in the app.`}
          </p>
        </div>
        <ul className="flex gap-5 text-[15px]" aria-label="Line colours when a day is open">
          {METRICS.map((m) => (
            <li key={m.key} className="flex items-center gap-2">
              <span className="h-[3px] w-5 rounded-full" style={{ background: METRIC_COLOR[m.key] }} />
              {m.label}
            </li>
          ))}
        </ul>
      </header>

      <Timeline
        entries={entries}
        expanded={expanded}
        onExpandedChange={setExpanded}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        wide
      >
        <article className="max-w-[65ch] rounded-xl bg-paper px-7 py-6">
          <h2 className="text-lg font-bold">Case summary</h2>
          <p className="mt-3 whitespace-pre-wrap text-[1.0625rem] leading-[1.6]">{summary}</p>
        </article>
        <p className="text-[15px] text-slate">Click a day in the graph to read that entry, then drag along it to move between days.</p>
      </Timeline>
    </div>
  );
}
