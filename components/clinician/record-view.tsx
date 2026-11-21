"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CheckupRequest } from "@/lib/requests";
import type { Entry } from "@/lib/types";
import { MeasureChart, RangePicker, type Range } from "./chart";
import { SERIES } from "./case";
import { DayLink, DayProvider } from "./day";
import { fmtScore } from "./format";
import { Pictures } from "./pictures";

// The patient's whole record for the clinician: the graphs over the years,
// the entries, the pictures, and the requests so far. The summary arrives
// as a slot because it is written on the server.

export function RecordView({
  entries,
  requests,
  summary,
}: {
  entries: Entry[];
  requests: Pick<CheckupRequest, "id" | "createdAt" | "headline" | "status" | "patientId">[];
  summary: React.ReactNode;
}) {
  const [range, setRange] = useState<Range>("all");
  const [onlyWords, setOnlyWords] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const marks = requests.map((r) => ({
    date: new Date(r.createdAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }),
    label: "Request sent",
  }));
  const rows = [...entries].reverse().filter((e) => !onlyWords || e.text.trim() || e.images.length);
  const shown = showAll ? rows : rows.slice(0, 12);

  return (
    <DayProvider entries={entries}>
      <div className="space-y-8">
        {summary}

        <section aria-labelledby="graphs" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="graphs" className="text-lg font-semibold">
              Over time
            </h2>
            <RangePicker value={range} onChange={setRange} />
          </div>
          <Card>
            <MeasureChart entries={entries} seriesKey="combined" range={range} height={230} marks={marks} large />
          </Card>
          <div className="space-y-4">
            {SERIES.filter((s) => s.key !== "combined").map((s) => (
              <Card key={s.key}>
                <MeasureChart entries={entries} seriesKey={s.key} range={range} height={150} marks={marks} />
              </Card>
            ))}
          </div>
          <p className="text-sm text-muted">
            Every figure runs from 1 to 5 and 5 is always the good end. Rings mark days with words or pictures; click anywhere on a graph to open the nearest day.
          </p>
        </section>

        <section aria-labelledby="pictures">
          <h2 id="pictures" className="mb-3 text-lg font-semibold">
            Pictures over time
          </h2>
          <Pictures entries={entries} />
        </section>

        <section aria-labelledby="entries">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="entries" className="text-lg font-semibold">
              Entries
            </h2>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={onlyWords} onChange={(e) => setOnlyWords(e.target.checked)} />
              Only days with words or pictures
            </label>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {shown.map((e) => (
              <li key={e.date} className="flex items-start gap-4 px-5 py-3">
                <div className="w-36 shrink-0">
                  <DayLink date={e.date} />
                </div>
                <p className="flex-1 text-sm">{e.text.trim() || <span className="text-muted">Figures only</span>}</p>
                <Badge>Combined {fmtScore(e.combined)}</Badge>
              </li>
            ))}
            {shown.length === 0 && <li className="px-5 py-4 text-muted">No entries match.</li>}
          </ul>
          {!showAll && rows.length > shown.length && (
            <button onClick={() => setShowAll(true)} className="mt-2 text-sm text-accent hover:underline">
              Show all {rows.length}
            </button>
          )}
        </section>
      </div>
    </DayProvider>
  );
}
