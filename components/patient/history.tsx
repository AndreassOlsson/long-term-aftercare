"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { addDays } from "@/lib/dates";
import { COMBINED, METRICS, ownKeys, scoredEverything, type MetricKey } from "@/lib/metrics";
import type { Entry } from "@/lib/types";
import { MeasureRow } from "./measure";

// The history: how well it has been working over the months and years, in a
// window she can move. Tapping a day opens its words and pictures. The one
// combined line comes apart into the three measures it is made of: it is one
// drawing, `t` runs from 0 (combined) to 1 (apart), and every line's place
// and values are blended by it.

const LEFT = 8;
const RIGHT = 10;
const BIG = 224;
const SMALL = 96;
const GAP = 30;
const AXIS = 24;
const SPLIT_MS = 700;

const WINDOWS = [
  { label: "1 month", days: 30 },
  { label: "3 months", days: 91 },
  { label: "1 year", days: 365 },
  { label: "All", days: 0 },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const dayNum = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000);
const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

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

function useSplit(target: number) {
  const [t, setT] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = still ? 1 : Math.min(1, (now - start) / SPLIT_MS);
      current.current = lerp(from, target, ease(p));
      setT(current.current);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return t;
}

/** Month or day ticks that fit the window. */
function ticks(start: string, end: string, span: number): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  if (span <= 45) {
    for (let d = addDays(start, 0); d <= end; d = addDays(d, 7)) out.push({ date: d, label: fmt(d, { day: "numeric", month: "short" }) });
    return out;
  }
  const step = span <= 200 ? 1 : span <= 450 ? 3 : span <= 1000 ? 6 : 12;
  const first = new Date(`${start}T12:00:00Z`);
  let y = first.getUTCFullYear();
  let m = first.getUTCMonth(); // zero-based; the first tick is the next month start
  m += 1;
  for (;;) {
    while (m >= 12) {
      m -= 12;
      y += 1;
    }
    const date = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    if (date > end) break;
    // Only every `step` months counted from January, so ticks stay on tidy months.
    if (m % step === 0 || step === 1) {
      out.push({ date, label: fmt(date, span <= 200 ? { month: "short" } : { month: "short", year: "2-digit" }) });
    }
    m += 1;
  }
  return out;
}

export function History({ entries, initialDay }: { entries: Entry[]; initialDay: string | null }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const first = entries[0]?.date;
  const last = entries[entries.length - 1]?.date;
  const total = first && last ? dayNum(last) - dayNum(first) + 1 : 0;

  const [windowDays, setWindowDays] = useState(Math.min(91, Math.max(14, total)));
  const [end, setEnd] = useState(() => {
    if (!initialDay || !last) return last ?? "";
    const wanted = addDays(initialDay, Math.round(Math.min(91, total) / 2));
    return wanted > last ? last : wanted;
  });
  const [selected, setSelected] = useState(initialDay ?? last ?? "");
  const [apart, setApart] = useState(false);
  const t = useSplit(apart ? 1 : 0);

  if (entries.length === 0 || !first || !last) {
    return (
      <Card>
        <p>Nothing here yet. After your first check-in the history starts to fill in.</p>
      </Card>
    );
  }

  const span = windowDays === 0 ? total : Math.min(windowDays, total);
  const endDate = end < addDays(first, span - 1) ? addDays(first, span - 1) : end > last ? last : end;
  const startDate = addDays(endDate, -(span - 1));
  const visible = entries.filter((e) => e.date >= startDate && e.date <= endDate);

  const inner = Math.max(1, width - LEFT - RIGHT);
  const x = (d: string) => LEFT + ((dayNum(d) - dayNum(startDate)) / Math.max(1, span - 1)) * inner;
  const bandsTop = (k: number) => lerp(24, k * (SMALL + GAP) + GAP - 4, t);
  const bandH = lerp(BIG - 44, SMALL - 14, t);
  const height = lerp(BIG + AXIS, METRICS.length * (SMALL + GAP) + AXIS, t);
  const dots = visible.length <= 70;

  const lines = [
    { key: "combined" as const, label: COMBINED.label, words: COMBINED.words },
    ...METRICS.map((m) => ({ key: m.key, label: m.label, words: m.words as readonly string[] })),
  ];
  // Band 0 is the combined line and stays the first band; the three measures start on top of
  // it and slide down into their own bands as t grows.
  const bands = METRICS.map((m, k) => {
    const top = bandsTop(k);
    const y = (v: number) => top + bandH - ((v - 1) / 4) * bandH;
    const pts = visible.map((e) => {
      if (e.combined === null) return null;
      const own = e.scores[m.key];
      if (own === null) return t === 0 ? { e, x: x(e.date), y: y(e.combined) } : null;
      return { e, x: x(e.date), y: y(lerp(e.combined, own, t)) };
    });
    let path = "";
    let pen = false;
    for (const p of pts) {
      if (!p) {
        pen = false;
        continue;
      }
      path += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      pen = true;
    }
    return { m, k, top, y, path, pts };
  });

  const selectedEntry = entries.find((e) => e.date === selected) ?? visible[visible.length - 1];
  const selectedIndex = entries.findIndex((e) => e.date === selectedEntry?.date);

  function pick(event: React.PointerEvent<SVGSVGElement>) {
    if (visible.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    let best = visible[0];
    for (const e of visible) if (Math.abs(x(e.date) - px) < Math.abs(x(best.date) - px)) best = e;
    setSelected(best.date);
  }

  function move(days: number) {
    const next = addDays(endDate, days);
    setEnd(next > last ? last : next < addDays(first, span - 1) ? addDays(first, span - 1) : next);
  }

  // The strip under the graph shows all the years; its frame is the window.
  const stripW = Math.max(1, width);
  const sx = (d: string) => ((dayNum(d) - dayNum(first)) / Math.max(1, total - 1)) * stripW;
  function dragStrip(event: React.PointerEvent<SVGSVGElement>) {
    if (event.type === "pointermove" && event.buttons === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const centre = dayNum(first) + ratio * (total - 1);
    const wanted = new Date((centre + span / 2) * 86_400_000).toISOString().slice(0, 10);
    setEnd(wanted > last ? last : wanted < addDays(first, span - 1) ? addDays(first, span - 1) : wanted);
  }

  const labelFor = (k: number) => (k === 0 && t < 0.5 ? lines[0] : lines[k + 1]);
  const rangeText = `${fmt(startDate, { day: "numeric", month: "short", year: "numeric" })} to ${fmt(endDate, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="How much time to show">
        {WINDOWS.filter((w) => w.days === 0 || w.days <= total + 30).map((w) => {
          const on = w.days === 0 ? windowDays === 0 : windowDays === w.days;
          return (
            <button
              key={w.label}
              type="button"
              aria-pressed={on}
              onClick={() => setWindowDays(w.days)}
              className={`min-h-11 rounded-full border px-4 ${on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"}`}
            >
              {w.label}
            </button>
          );
        })}
      </div>

      <Card className="px-2">
        <p className="px-2 text-center text-sm text-muted" aria-live="polite">
          {rangeText}
        </p>
        <div className="flex items-center justify-between px-2 pb-1">
          <button type="button" onClick={() => move(-Math.ceil(span / 2))} disabled={startDate <= first} className="min-h-11 whitespace-nowrap px-2 text-accent disabled:text-muted" aria-label="Show earlier">
            ‹ Earlier
          </button>
          <button type="button" onClick={() => move(Math.ceil(span / 2))} disabled={endDate >= last} className="min-h-11 whitespace-nowrap px-2 text-accent disabled:text-muted" aria-label="Show later">
            Later ›
          </button>
        </div>
        <div ref={ref}>
          {width > 0 && (
            <svg
              width={width}
              height={height}
              onPointerDown={pick}
              role="img"
              aria-label={`How well your prosthesis has been working, ${rangeText}. Higher is better. Tap a day to read it.`}
              className="block touch-pan-y select-none"
            >
              {bands.map(({ m, k, top, y, path, pts }) => {
                const lab = labelFor(k);
                const sel = pts.find((p) => p?.e.date === selectedEntry?.date);
                const opacityLabel = k === 0 ? 1 : t;
                return (
                  <g key={m.key} opacity={k === 0 ? 1 : 0.35 + 0.65 * t}>
                    {[1, 3, 5].map((v) => (
                      <path key={v} d={`M${LEFT},${y(v)}H${width - RIGHT}`} stroke="var(--color-line)" strokeWidth={1} strokeDasharray={v === 3 ? "3 4" : undefined} />
                    ))}
                    <g opacity={opacityLabel} fontSize={12} fill="var(--color-muted)" style={{ paintOrder: "stroke" }} stroke="var(--color-surface)" strokeWidth={3}>
                      <text x={LEFT + 2} y={top - 6} fontWeight={600} fill="var(--color-ink)">
                        {lab.label}
                      </text>
                      <text x={width - RIGHT - 2} y={top - 6} textAnchor="end">
                        {lab.words[4]} ↑
                      </text>
                      <text x={LEFT + 2} y={y(1) + 14}>
                        {lab.words[0]} ↓
                      </text>
                    </g>
                    <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={k === 0 ? lerp(3, 2.5, t) : 2.5} strokeLinejoin="round" strokeLinecap="round" />
                    {dots &&
                      pts.map(
                        (p) =>
                          p && (
                            <circle key={p.e.date} cx={p.x} cy={p.y} r={p.e.text || p.e.images.length ? 3.5 : 2} fill={p.e.text || p.e.images.length ? "var(--color-accent)" : "var(--color-surface)"} stroke="var(--color-accent)" strokeWidth={1.5} />
                          ),
                      )}
                    {sel && (
                      <>
                        <path d={`M${sel.x},${top}V${top + bandHeightOf(t)}`} stroke="var(--color-ink)" strokeWidth={1} strokeDasharray="2 3" />
                        <circle cx={sel.x} cy={sel.y} r={7} fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth={2.5} />
                      </>
                    )}
                  </g>
                );
              })}
              <g fontSize={11} fill="var(--color-muted)">
                {ticks(startDate, endDate, span).map((tk) => (
                  <g key={tk.date}>
                    <path d={`M${x(tk.date)},${height - AXIS}v4`} stroke="var(--color-muted)" />
                    <text x={x(tk.date)} y={height - 6} textAnchor="middle">
                      {tk.label}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
          )}
        </div>
        <div className="px-2 pt-2">
          <button type="button" onClick={() => setApart((a) => !a)} aria-pressed={apart} className="min-h-11 text-accent underline underline-offset-2">
            {apart ? "Put it back together" : "See what it is made of"}
          </button>
        </div>
      </Card>

      {total > span && (
        <div>
          <svg
            width={stripW}
            height={44}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragStrip(e);
            }}
            onPointerMove={dragStrip}
            role="slider"
            aria-label="Move the window through all your years"
            aria-valuetext={rangeText}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(((dayNum(endDate) - dayNum(first)) / Math.max(1, total - 1)) * 100)}
            className="block touch-none rounded-xl bg-surface"
          >
            <path
              d={entries
                .filter((e) => e.combined !== null)
                .map((e, i) => `${i ? "L" : "M"}${sx(e.date).toFixed(1)},${(38 - (((e.combined as number) - 1) / 4) * 32).toFixed(1)}`)
                .join("")}
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth={1.5}
            />
            <rect x={sx(startDate)} y={2} width={Math.max(10, sx(endDate) - sx(startDate))} height={40} rx={8} fill="var(--color-accent)" fillOpacity={0.15} stroke="var(--color-accent)" strokeWidth={2} />
          </svg>
          <p className="mt-1 text-xs text-muted">All your years, {fmt(first, { month: "short", year: "numeric" })} to {fmt(last, { month: "short", year: "numeric" })}. Drag the frame to move the window.</p>
        </div>
      )}

      {selectedEntry && (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => entries[selectedIndex - 1] && setSelected(entries[selectedIndex - 1].date)}
              disabled={selectedIndex <= 0}
              className="min-h-11 px-1 text-accent disabled:text-muted"
              aria-label="Previous check-in"
            >
              ←
            </button>
            <h2 className="text-center text-lg font-semibold">{fmt(selectedEntry.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
            <button
              type="button"
              onClick={() => entries[selectedIndex + 1] && setSelected(entries[selectedIndex + 1].date)}
              disabled={selectedIndex >= entries.length - 1}
              className="min-h-11 px-1 text-accent disabled:text-muted"
              aria-label="Next check-in"
            >
              →
            </button>
          </div>
          <div className="mt-2 divide-y divide-line">
            <MeasureRow name="combined" score={selectedEntry.combined} />
            {METRICS.map((m) => (
              <MeasureRow key={m.key} name={m.key as MetricKey} score={selectedEntry.scores[m.key]} own={selectedEntry.ownScores?.[m.key] != null} />
            ))}
          </div>
          <h3 className="mt-3 text-sm font-medium text-muted">What you wrote</h3>
          {selectedEntry.text ? <p className="mt-1 whitespace-pre-wrap">{selectedEntry.text}</p> : <p className="mt-1 text-muted">You wrote nothing that day.</p>}
          {selectedEntry.images.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedEntry.images.map((key) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={key} src={`/api/images?key=${encodeURIComponent(key)}`} alt={`Picture from ${fmt(selectedEntry.date, { day: "numeric", month: "long" })}`} className="max-h-56 rounded-xl" />
              ))}
            </div>
          )}
          {selectedEntry.questions && selectedEntry.questions.length > 0 && (
            <details className="mt-3 text-sm text-muted">
              <summary className="min-h-8 cursor-pointer">What you were asked</summary>
              <ul className="mt-1 list-disc pl-5">
                {selectedEntry.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </details>
          )}
          {selectedEntry.analyzedBy !== "seed" && (
            <p className="mt-3 text-xs text-muted">
              {scoredEverything(selectedEntry.ownScores)
                ? "Scored by you."
                : selectedEntry.analyzedBy === "claude"
                  ? `Read by Claude${ownKeys(selectedEntry.ownScores).length ? ", apart from what you picked yourself." : "."}`
                  : `Read by the built-in stand-in, not the AI${ownKeys(selectedEntry.ownScores).length ? ", apart from what you picked yourself." : "."}`}
            </p>
          )}
          <p className="mt-3 text-sm">
            <Link href="/patient/clinic/new" className="text-accent underline underline-offset-2">
              Ask for a check-up
            </Link>
          </p>
        </Card>
      )}
    </div>
  );
}

const bandHeightOf = (t: number) => lerp(BIG - 44, SMALL - 14, t);
