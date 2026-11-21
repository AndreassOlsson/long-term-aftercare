"use client";

import { useEffect, useRef, useState } from "react";
import { addDays } from "@/lib/dates";
import { COMBINED } from "@/lib/metrics";

// The home page's graph: how well it has been working, over the last twelve
// weeks, across the whole width of the screen. One line, the scale named at
// both ends, dates along the bottom, today's point marked once it is in.

const DAYS = 84;
const PAD = { left: 14, right: 18, top: 28, bottom: 30 };

const dayNum = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000);
const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function HomeGraph({ points, today, checkedIn }: { points: { date: string; combined: number }[]; today: string; checkedIn: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const start = addDays(today, -(DAYS - 1));
  const visible = points.filter((p) => p.date >= start && p.date <= today);
  const { w, h } = size;
  const x = (d: string) => PAD.left + ((dayNum(d) - dayNum(start)) / (DAYS - 1)) * (w - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - 1) / 4) * (h - PAD.top - PAD.bottom);
  const path = visible.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.combined).toFixed(1)}`).join("");
  const area = visible.length ? `${path}L${x(visible[visible.length - 1].date).toFixed(1)},${y(1)}L${x(visible[0].date).toFixed(1)},${y(1)}Z` : "";
  const last = visible[visible.length - 1];
  const ticks = [0, 28, 56, 83].map((n) => addDays(start, n));

  return (
    <div ref={ref} className="relative min-h-64 flex-1" data-testid="home-graph">
      {w > 0 && h > 0 && (
        <svg width={w} height={h} role="img" aria-label="How well your prosthesis has been working over the last twelve weeks. Higher is better." className="absolute inset-0 block">
          {[1, 3, 5].map((v) => (
            <path key={v} d={`M${PAD.left},${y(v)}H${w - PAD.right}`} stroke="var(--color-line)" strokeWidth={1} strokeDasharray={v === 3 ? "3 4" : undefined} />
          ))}
          <g fontSize={12} fill="var(--color-muted)">
            <text x={PAD.left + 2} y={PAD.top - 10}>
              {COMBINED.ends[1]} ↑
            </text>
            <text x={PAD.left + 2} y={y(1) - 6}>
              {COMBINED.ends[0]} ↓
            </text>
          </g>
          {area && <path d={area} fill="var(--color-accent)" fillOpacity={0.08} />}
          <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          {last && (
            <circle
              cx={x(last.date)}
              cy={y(last.combined)}
              r={checkedIn && last.date === today ? 8 : 6}
              fill={checkedIn && last.date === today ? "var(--color-accent)" : "var(--color-surface)"}
              stroke="var(--color-accent)"
              strokeWidth={3}
              data-testid="graph-last-point"
              data-date={last.date}
            />
          )}
          <g fontSize={11} fill="var(--color-muted)">
            {ticks.map((d, i) => (
              <text key={d} x={Math.min(w - PAD.right, Math.max(PAD.left, x(d)))} y={h - 8} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>
                {i === ticks.length - 1 ? "Today" : label(d)}
              </text>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}
