"use client";

import type { Entry } from "@/lib/types";
import { DayLink } from "./day";
import { longDate } from "./format";

// The pictures in a record, oldest to newest, with the first and the latest
// side by side so a change over time shows without scrolling.

export function Pictures({ entries, attached = [] }: { entries: Entry[]; attached?: string[] }) {
  const all = entries.flatMap((e) => e.images.map((key) => ({ key, date: e.date })));
  const seen = new Set(all.map((p) => p.key));
  // A picture attached to a request but not found in an entry still shows.
  for (const key of attached) if (!seen.has(key)) all.push({ key, date: "" });
  if (all.length === 0) {
    return <p className="text-muted">No pictures in the record yet.</p>;
  }
  const src = (key: string) => `/api/images?key=${encodeURIComponent(key)}`;
  const first = all[0];
  const last = all[all.length - 1];
  return (
    <div className="space-y-4">
      {all.length > 1 && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Earliest", p: first },
            { label: "Latest", p: last },
          ].map(({ label, p }) => (
            <figure key={label}>
              {/* eslint-disable-next-line @next/next/no-img-element -- private, served through our own route */}
              <img src={src(p.key)} alt={`${label} picture`} className="w-full rounded-xl border border-line" />
              <figcaption className="mt-1 text-sm text-muted">
                {label}: {p.date ? <DayLink date={p.date} /> : "attached to the request"}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {all.map((p) => (
          <li key={p.key} className="w-28 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, served through our own route */}
            <img src={src(p.key)} alt={p.date ? `Picture from ${longDate(p.date)}` : "Attached picture"} className="aspect-square w-full rounded-lg border border-line object-cover" />
            <p className="mt-1 text-xs">{p.date ? <DayLink date={p.date} /> : "Attached"}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
