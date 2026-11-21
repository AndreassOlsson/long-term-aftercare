"use client";

import { useEffect, useRef, useState } from "react";
import { METRIC_COLOR } from "./metric-colors";
import { formatDate, formatLongDate } from "@/lib/dates";
import { METRICS, SCORE_MAX, SCORE_MIN } from "@/lib/metrics";
import type { Entry } from "@/lib/types";

// The graph both sides look at. Collapsed it is one ink line, the combined
// score. Expanded, that line comes apart into one coloured strand per metric,
// and the selected day's notes and pictures show beside or under it.
//
// The split is one drawing, not two: `t` runs from 0 (collapsed) to 1
// (expanded) and every line's position, values and colour are blended by it,
// so the combined line visibly separates into the metrics it is made of.
//
// The strands are sized so the expanded graph is about as tall as the
// combined one: opening a day never pushes the notes off the screen.

const SIZES = {
  phone: { big: 220, small: 50, gap: 34 },
  wide: { big: 300, small: 70, gap: 38 },
};
const DATES = 28; // room under the graph for the first and last date
const LEFT = 26;
const RIGHT = 14;
const SPLIT_MS = 800;
const LEVELS = [1, 2, 3, 4, 5];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const strand = (key: keyof typeof METRIC_COLOR, t: number) =>
  `color-mix(in oklab, var(--color-ink), ${METRIC_COLOR[key]} ${Math.round(t * 100)}%)`;

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
  /** Desktop layout: the graph on the left, the day or `children` beside it. */
  wide?: boolean;
  /** Shown with the graph while no day is open. */
  children?: React.ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const t = useSplit(expanded ? 1 : 0);
  const dragging = useRef(false);
  const { big, small, gap } = wide ? SIZES.wide : SIZES.phone;

  const n = entries.length;
  const selectedIndex = Math.max(
    0,
    entries.findIndex((e) => e.date === selectedDate),
  );
  const selected = entries[selectedIndex];
  const inner = Math.max(1, width - LEFT - RIGHT);
  const x = (i: number) => LEFT + (n <= 1 ? inner / 2 : (i / (n - 1)) * inner);
  const plotHeight = lerp(big, METRICS.length * (small + gap), t);
  const height = plotHeight + DATES;

  const bands = METRICS.map((metric, k) => {
    const top = lerp(26, k * (small + gap) + gap - 4, t);
    const bandHeight = lerp(big - 36, small - 8, t);
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
    return { metric, k, top, bandHeight, y, path, points };
  });

  function dayAt(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left - LEFT) / inner;
    return Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
  }

  // Press to open a day; keep the finger down and slide to move through days.
  function press(event: React.PointerEvent<SVGSVGElement>) {
    if (n === 0) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(entries[dayAt(event)].date);
    if (!expanded) onExpandedChange(true);
  }
  function slide(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragging.current || n === 0) return;
    const date = entries[dayAt(event)].date;
    if (date !== selectedDate) onSelect(date);
  }
  const release = () => {
    dragging.current = false;
  };

  const step = (by: number) => {
    const next = Math.min(n - 1, Math.max(0, selectedIndex + by));
    onSelect(entries[next].date);
  };

  const graph = (
    <div ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onPointerDown={press}
          onPointerMove={slide}
          onPointerUp={release}
          onPointerCancel={release}
          role="img"
          aria-label={
            expanded
              ? "One graph per metric over time, 5 is best. Drag along it to move between days."
              : "Combined score over time, 5 is best. Tap a day to open it."
          }
          className="block cursor-pointer touch-pan-y select-none"
        >
          {/* How the scale reads, on the combined graph only. */}
          <text x={LEFT - 6} y={14} opacity={1 - t} className="fill-slate text-[13px]">
            Better
          </text>

          {bands.map(({ metric, k, top, y }) => {
            const value = selected?.scores[metric.key] ?? null;
            return (
              <g key={`grid-${metric.key}`} opacity={k === 0 ? 1 : t}>
                {LEVELS.map((level) => (
                  <line
                    key={level}
                    x1={LEFT}
                    x2={width - RIGHT}
                    y1={y(level)}
                    y2={y(level)}
                    stroke="var(--color-rule)"
                    strokeWidth={level === SCORE_MIN ? 1.5 : 1}
                    // In the small strands only 1, 3 and 5 stay, so they do not crowd.
                    opacity={level % 2 === 1 ? 1 : 1 - t}
                  />
                ))}
                {[SCORE_MIN, SCORE_MAX].map((level) => (
                  <text
                    key={level}
                    x={LEFT - 10}
                    y={y(level) + 4}
                    textAnchor="end"
                    className="fill-slate text-[11px]"
                  >
                    {level}
                  </text>
                ))}
                <text x={LEFT - 6} y={top - 12} opacity={t} className="text-[14px]">
                  <tspan className="font-semibold" style={{ fill: METRIC_COLOR[metric.key] }}>
                    {metric.label}
                  </tspan>
                  <tspan dx={8} className={value === null ? "fill-slate" : "fill-ink font-bold"}>
                    {value === null ? "not mentioned" : value.toFixed(1)}
                  </tspan>
                </text>
              </g>
            );
          })}

          {/* The selected day, across every strand. */}
          {selected && t > 0 && (
            <line
              x1={x(selectedIndex)}
              x2={x(selectedIndex)}
              y1={bands[0].top - 4}
              y2={plotHeight}
              stroke="var(--color-slate)"
              strokeDasharray="3 4"
              opacity={t * 0.6}
            />
          )}

          {bands.map(({ metric, path }) => (
            <path
              key={`line-${metric.key}`}
              d={path}
              fill="none"
              strokeWidth={lerp(3, 2.25, t)}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ stroke: strand(metric.key, t) }}
            />
          ))}

          {bands.map(({ metric, points }) => {
            const mark = points[selectedIndex];
            if (!mark) return null;
            return (
              <circle
                key={`mark-${metric.key}`}
                cx={mark.x}
                cy={mark.y}
                r={lerp(7, 5.5, t)}
                fill="var(--color-paper)"
                strokeWidth={2.5}
                style={{ stroke: strand(metric.key, t) }}
                className={arrivingDate === selected?.date ? "animate-pulse" : undefined}
              />
            );
          })}

          {n > 0 && (
            <g className="fill-slate text-[12px]">
              <text x={LEFT} y={height - 6}>
                {formatDate(entries[0].date)}
              </text>
              <text x={width - RIGHT} y={height - 6} textAnchor="end">
                {formatDate(entries[n - 1].date)}
              </text>
            </g>
          )}
        </svg>
      )}
    </div>
  );

  const side =
    expanded && selected ? (
      <Day
        entry={selected}
        first={selectedIndex === 0}
        last={selectedIndex >= n - 1}
        onStep={step}
        onClose={() => onExpandedChange(false)}
        opacity={t}
      />
    ) : (
      children
    );

  if (wide) {
    return (
      <section className="grid grid-cols-[minmax(0,1.7fr)_minmax(19rem,1fr)] items-start gap-12">
        <div className="sticky top-8">{graph}</div>
        <div className="flex flex-col gap-6">{side}</div>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-6">
      {graph}
      {side}
    </section>
  );
}

/** One day: its date, its own words and its pictures. The scores are on the graph. */
function Day({
  entry,
  first,
  last,
  onStep,
  onClose,
  opacity,
}: {
  entry: Entry;
  first: boolean;
  last: boolean;
  onStep: (by: number) => void;
  onClose: () => void;
  opacity: number;
}) {
  return (
    <div className="flex flex-col gap-5" style={{ opacity }}>
      <div className="flex items-start justify-between gap-3">
        <div aria-live="polite">
          <h2 className="text-xl font-bold leading-tight">{formatLongDate(entry.date)}</h2>
          <p className="mt-0.5 text-slate">
            {entry.combined === null ? (
              "Not scored this day"
            ) : (
              <>
                Overall <span className="font-semibold text-ink">{entry.combined.toFixed(1)}</span> of {SCORE_MAX}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <RoundButton label="Previous day" disabled={first} onClick={() => onStep(-1)}>
            <path d="M15 5l-7 7 7 7" />
          </RoundButton>
          <RoundButton label="Next day" disabled={last} onClick={() => onStep(1)}>
            <path d="M9 5l7 7-7 7" />
          </RoundButton>
          <RoundButton label="Close the day and show the combined graph" onClick={onClose} solid>
            <path d="M6 6l12 12M18 6L6 18" />
          </RoundButton>
        </div>
      </div>

      {entry.text ? (
        <blockquote className="border-l-[3px] border-ink pl-4 font-voice text-[1.0625rem] leading-[1.65] whitespace-pre-wrap">
          {entry.text}
        </blockquote>
      ) : (
        <p className="text-slate">No notes this day.</p>
      )}

      {entry.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entry.images.map((key, i) => {
            const src = `/api/images?key=${encodeURIComponent(key)}`;
            return (
              <a key={key} href={src} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Picture ${i + 1} from ${formatLongDate(entry.date)}, opens full size`}
                  className="h-24 w-24 rounded-md bg-paper object-cover"
                />
              </a>
            );
          })}
        </div>
      )}

      {entry.followUp?.answer && (
        <div>
          <p className="text-slate">{entry.followUp.question}</p>
          <p className="mt-1 border-l-[3px] border-rule pl-4 font-voice leading-[1.65] whitespace-pre-wrap">
            {entry.followUp.answer}
          </p>
        </div>
      )}

      {entry.questions && entry.questions.length > 0 && (
        <details className="text-[15px] text-slate">
          <summary className="cursor-pointer">Asked that day</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {entry.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </details>
      )}

      {entry.analyzedBy !== "seed" && (
        <p className="text-[13px] leading-relaxed text-slate">
          {entry.analyzedBy === "claude"
            ? `Scored by the AI analysis. ${entry.rationale}`
            : "Scored by the built-in stand-in, not the AI analysis."}
        </p>
      )}
    </div>
  );
}

function RoundButton({
  label,
  disabled = false,
  onClick,
  solid = false,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  solid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${
        solid
          ? "border-ink bg-ink text-paper hover:bg-ink-soft"
          : "border-ink hover:bg-paper disabled:border-rule disabled:text-rule"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}
