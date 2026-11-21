"use client";

import { useState } from "react";
import { Timeline } from "./timeline";
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
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">Patient: {name}</h1>
      <Timeline
        entries={entries}
        expanded={expanded}
        onExpandedChange={setExpanded}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        wide
      >
        <div className="max-w-2xl rounded-2xl border border-zinc-300 p-4">
          <h2 className="mb-2 text-sm font-medium text-zinc-500">Summary of patient case</h2>
          <p className="whitespace-pre-wrap">{summary}</p>
        </div>
        <p className="text-sm text-zinc-500">Click on a date in the graph to expand detailed information.</p>
      </Timeline>
    </div>
  );
}
