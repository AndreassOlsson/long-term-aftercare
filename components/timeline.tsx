"use client";

import { useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/dates";
import { METRICS, SCORE_MAX, SCORE_MIN } from "@/lib/metrics";
import type { Entry } from "@/lib/types";

// The graph both sides look at. Collapsed it is one line, the combined score.
// Expanded, that line splits into one graph per metric, and the day that is
// selected shows its picture and the patient's own notes underneath.
//
// The split is one drawing, not two: `t` runs from 0 (collapsed) to 1
// (expanded) and every line's position and values are blended by it, so the
// combined line visibly comes apart into the metrics it is made of.

const BIG = 220; // height of the combined graph
const SMALL = 96; // height of each metric graph when expanded
const GAP = 34; // room above each metric graph for its label
const LEFT = 26;
const RIGHT = 14;
const SPLIT_MS = 800;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Follows `target` (0 or 1) smoothly; jumps when the viewer prefers no motion. */
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

export function Timeline({
  entries,
  expanded,
  onExpandedChange,
  selectedDate,
  onSelect,
  arrivingDate,
  wide = false,
  children,
}: {
  entries: Entry[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  selectedDate: string;
  onSelect: (date: string) => void;
  /** A day that was just added: its point is drawn pulsing. */
  arrivingDate?: string | null;
  /** Desktop layout: picture and notes side by side. */
  wide?: boolean;
  /** Shown under the graph while collapsed. */
  children?: React.ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const t = useSplit(expanded ? 1 : 0);

  const n = entries.length;
  const selectedIndex = Math.max(
    0,
    entries.findIndex((e) => e.date === selectedDate),
  );
  const selected = entries[selectedIndex];
  const inner = Math.max(1, width - LEFT - RIGHT);
  const x = (i: number) => LEFT + (n <= 1 ? inner / 2 : (i / (n - 1)) * inner);
  const height = lerp(BIG, METRICS.length * (SMALL + GAP), t);

  const bands = METRICS.map((metric, k) => {
    const top = lerp(8, k * (SMALL + GAP) + GAP - 6, t);
    const bandHeight = lerp(BIG - 30, SMALL - 14, t);
    const y = (v: number) =>
      top + bandHeight - ((v - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * bandHeight;
    const points = entries.map((entry, i) => {
      const combined = entry.combined;
      if (combined === null) return null;
      const own = entry.scores[metric.key];
      // A metric the patient said nothing about is a gap in its own graph,
      // never a borrowed value.
      if (own === null) return t === 0 ? { x: x(i), y: y(combined) } : null;
      return { x: x(i), y: y(lerp(combined, own, t)) };
    });
    let path = "";
    let pen = false;
    for (const p of points) {
      if (!p) {
        pen = false;
        continue;
      }
      path += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      pen = true;
    }
    return { metric, k, top, bandHeight, path, points };
  });

  function pick(event: React.MouseEvent<SVGSVGElement>) {
    if (n === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left - LEFT) / inner;
    const index = Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
    onSelect(entries[index].date);
    if (!expanded) onExpandedChange(true);
  }

  return (
    <section className="flex flex-col gap-4">
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            onClick={pick}
            role="img"
            aria-label={
              expanded
                ? "One graph per metric over time. Click a day to select it."
                : "Combined satisfaction over time. Click a day to see the detail."
            }
            className="block cursor-pointer select-none"
          >
            {bands.map(({ metric, k, top, bandHeight, path, points }) => {
              const axis = k === 0 ? 1 : t;
              const mark = points[selectedIndex];
              return (
                <g key={metric.key}>
                  <g opacity={axis} stroke="currentColor" strokeWidth={1.5} fill="none">
                    <path d={`M${LEFT - 8},${top - 4}V${top + bandHeight + 6}H${width - 2}`} />
                    <path d={`M${LEFT - 12},${top + 2}l4,-7l4,7`} />
                    <path d={`M${width - 9},${top + bandHeight + 2}l7,4l-7,4`} />
                  </g>
                  <text
                    x={LEFT - 8}
                    y={top - 12}
                    opacity={t}
                    className="fill-current text-xs"
                  >
                    {metric.label}
                  </text>
                  <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
                  {mark && (
                    <circle
                      cx={mark.x}
                      cy={mark.y}
                      r={7}
                      fill="white"
                      stroke="currentColor"
                      strokeWidth={2}
                      className={
                        arrivingDate === selected?.date ? "animate-pulse" : undefined
                      }
                    />
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {t > 0 && (
          <button
            type="button"
            onClick={() => onExpandedChange(false)}
            style={{ opacity: t }}
            aria-label="Close the detailed view"
            className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-current bg-white text-lg leading-none"
          >
            ✕
          </button>
        )}
      </div>

      {expanded && selected ? (
        <div className="flex flex-col gap-4" style={{ opacity: t }}>
          <label className="flex flex-col gap-1 text-sm">
            <span>
              Selected day: <strong>{formatDate(selected.date)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0, n - 1)}
              value={selectedIndex}
              onChange={(event) => onSelect(entries[Number(event.target.value)].date)}
              aria-label="Select a day on the timeline"
            />
          </label>
          <p>
            Overall satisfaction:{" "}
            <strong>{selected.combined === null ? "not scored" : selected.combined.toFixed(1)}</strong>
            <span className="text-sm text-zinc-500"> of {SCORE_MAX}</span>
          </p>
          <div className={wide ? "grid grid-cols-2 gap-4" : "flex flex-col gap-4"}>
            <div className="rounded-2xl border border-zinc-300 p-4">
              <h3 className="mb-2 text-sm font-medium text-zinc-500">Picture of selected day</h3>
              {selected.images.length === 0 ? (
                <p className="text-zinc-500">No picture this day.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selected.images.map((key) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={key}
                      src={`/api/images?key=${encodeURIComponent(key)}`}
                      alt={`Picture from ${formatDate(selected.date)}`}
                      className="max-h-64 rounded-lg"
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-zinc-300 p-4">
              <h3 className="mb-2 text-sm font-medium text-zinc-500">Patient own notes</h3>
              {selected.text ? (
                <p className="whitespace-pre-wrap">{selected.text}</p>
              ) : (
                <p className="text-zinc-500">No notes this day.</p>
              )}
              {selected.questions && selected.questions.length > 0 && (
                <div className="mt-3 text-sm text-zinc-500">
                  Asked that day:
                  <ul className="list-disc pl-5">
                    {selected.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selected.followUp?.answer && (
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  <span className="text-zinc-500">{selected.followUp.question}</span>
                  <br />
                  {selected.followUp.answer}
                </p>
              )}
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
                {METRICS.map((m) => (
                  <li key={m.key}>
                    {m.label}: {selected.scores[m.key]?.toFixed(1) ?? "not mentioned"}
                  </li>
                ))}
              </ul>
              {selected.analyzedBy !== "seed" && (
                <p className="mt-2 text-xs text-zinc-500">
                  {selected.analyzedBy === "claude"
                    ? `Scored by the AI analysis. ${selected.rationale}`
                    : "Scored by the built-in stand-in, not the AI analysis."}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
