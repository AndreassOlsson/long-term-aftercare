"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays } from "@/lib/dates";
import { SCORE_MAX, SCORE_MIN } from "@/lib/metrics";
import type { Entry } from "@/lib/types";
import { SERIES, valueOf, type SeriesKey } from "./case";
import { useOpenDay } from "./day";
import { fmtScore, longDate, shortDate } from "./format";

// A graph the clinician can read: dates along the bottom, the 1 to 5 scale
// up the side with its good end named, one panel per measure and one for the
// combined figure, and any point opens that day.

export type Range = "1m" | "3m" | "1y" | "all";
const RANGES: { key: Range; label: string; days: number | null }[] = [
  { key: "1m", label: "1 month", days: 31 },
  { key: "3m", label: "3 months", days: 92 },
  { key: "1y", label: "1 year", days: 366 },
  { key: "all", label: "All", days: null },
];

const LEFT = 64;
const RIGHT = 30;
const TOP = 10;
const BOTTOM = 26;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const dayNumber = (date: string) => Math.round(new Date(`${date}T12:00:00Z`).getTime() / 86400000);

/** Tick dates for an axis spanning from..to, sized to the span. */
function ticks(from: string, to: string): { date: string; label: string }[] {
  const span = dayNumber(to) - dayNumber(from);
  const out: { date: string; label: string }[] = [];
  if (span <= 75) {
    const step = span <= 35 ? 7 : 14;
    for (let d = to; d >= from; d = addDays(d, -step)) out.push({ date: d, label: shortDate(d) });
    return out.reverse();
  }
  const monthStep = span <= 400 ? 1 : span <= 800 ? 3 : 6;
  const start = new Date(`${from}T12:00:00Z`);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  if (start.getUTCDate() > 1) m += 1;
  for (let guard = 0; guard < 80; guard++) {
    if (m > 12) {
      y += Math.floor((m - 1) / 12);
      m = ((m - 1) % 12) + 1;
    }
    const date = `${y}-${String(m).padStart(2, "0")}-01`;
    if (date > to) break;
    if (date >= from) {
      const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
        month: "short",
        ...(monthStep > 1 || span > 400 ? { year: "2-digit" as const } : {}),
        timeZone: "UTC",
      });
      out.push({ date, label });
    }
    m += monthStep;
  }
  return out;
}

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div role="group" aria-label="Time range" className="inline-flex rounded-xl border border-line bg-surface p-0.5 text-sm">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          aria-pressed={value === r.key}
          className={`rounded-lg px-3 py-1.5 ${value === r.key ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function rangeBounds(entries: Entry[], range: Range): { from: string; to: string } {
  const to = entries[entries.length - 1]?.date ?? "";
  const first = entries[0]?.date ?? to;
  const days = RANGES.find((r) => r.key === range)?.days;
  const from = days ? addDays(to, -days) : first;
  return { from: from < first ? first : from, to };
}

export function MeasureChart({
  entries,
  seriesKey,
  range,
  height = 120,
  marks = [],
  large = false,
}: {
  entries: Entry[];
  seriesKey: SeriesKey;
  range: Range;
  height?: number;
  /** Days to flag with a vertical line, such as when a request was sent. */
  marks?: { date: string; label: string }[];
  large?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const open = useOpenDay();
  const [hover, setHover] = useState<string | null>(null);
  const meta = SERIES.find((s) => s.key === seriesKey)!;
  const { from, to } = rangeBounds(entries, range);
  const points = useMemo(
    () =>
      entries
        .filter((e) => e.date >= from && e.date <= to && valueOf(e, seriesKey) !== null)
        .map((e) => ({ date: e.date, value: valueOf(e, seriesKey) as number, noted: Boolean(e.text.trim() || e.images.length) })),
    [entries, from, to, seriesKey],
  );

  const innerW = Math.max(10, width - LEFT - RIGHT);
  const innerH = height - TOP - BOTTOM;
  const t0 = dayNumber(from);
  const span = Math.max(1, dayNumber(to) - t0);
  const x = (date: string) => LEFT + ((dayNumber(date) - t0) / span) * innerW;
  const y = (v: number) => TOP + (1 - (v - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * innerH;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const hovered = points.find((p) => p.date === hover);

  function nearest(clientX: number, rect: DOMRect) {
    const px = clientX - rect.left;
    let best = points[0];
    for (const p of points) if (Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px)) best = p;
    return best;
  }

  return (
    <div ref={ref} className="relative">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className={large ? "text-base font-semibold" : "text-sm font-medium"}>{meta.label}</h3>
        <p className="text-xs text-muted">{meta.scale}</p>
      </div>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${meta.label}, ${points.length} days from ${from} to ${to}. 5 is the good end.`}
          className="cursor-crosshair select-none"
          onMouseMove={(e) => points.length && setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()).date)}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => points.length && open(nearest(e.clientX, e.currentTarget.getBoundingClientRect()).date)}
        >
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={LEFT} x2={width - RIGHT} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={LEFT - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)">
                {v === 5 ? "5 best" : v === 1 ? "1 worst" : v}
              </text>
            </g>
          ))}
          {ticks(from, to).map((t) => (
            <g key={t.date}>
              <line x1={x(t.date)} x2={x(t.date)} y1={TOP} y2={TOP + innerH} stroke="var(--color-line)" strokeDasharray="2 4" />
              <text x={x(t.date)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
                {t.label}
              </text>
            </g>
          ))}
          {marks
            .filter((m) => m.date >= from && m.date <= to)
            .map((m) => (
              <g key={m.date + m.label}>
                <line x1={x(m.date)} x2={x(m.date)} y1={TOP} y2={TOP + innerH} stroke="var(--color-warn)" strokeWidth={1.5} />
                {large && (
                  <text x={x(m.date) - 4} y={TOP + 11} textAnchor="end" fontSize={11} fill="var(--color-warn)">
                    {m.label}
                  </text>
                )}
              </g>
            ))}
          <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={large ? 2.5 : 2} strokeLinejoin="round" />
          {points.map((p) =>
            p.noted ? <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={large ? 4 : 3} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={2} /> : null,
          )}
          {hovered && (
            <g pointerEvents="none">
              <line x1={x(hovered.date)} x2={x(hovered.date)} y1={TOP} y2={TOP + innerH} stroke="var(--color-muted)" />
              <circle cx={x(hovered.date)} cy={y(hovered.value)} r={5} fill="var(--color-accent)" />
            </g>
          )}
        </svg>
      )}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-2 py-1 text-xs shadow"
          style={{ left: Math.min(Math.max(x(hovered.date) - 60, 0), Math.max(0, width - 150)), top: 22 }}
        >
          <span className="font-medium">{longDate(hovered.date)}</span>: {fmtScore(hovered.value)}
          <span className="text-muted"> · click to open the day</span>
        </div>
      )}
    </div>
  );
}
