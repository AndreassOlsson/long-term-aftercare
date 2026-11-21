"use client";

import { METRICS } from "@/lib/metrics";

type Metric = (typeof METRICS)[number];

/**
 * One measure scored by the patient: five steps on a scale whose ends are
 * named, and the word for the picked step shown underneath. She never sees a
 * number; the stored value is the step's place from 1 to 5. Tapping the
 * picked step again, or "Clear", takes the pick back.
 */
export function ScorePicker({
  metric,
  value,
  onChange,
}: {
  metric: Metric;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const id = `pick-${metric.key}`;
  return (
    <div className="py-3" role="group" aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={id} className="font-medium">
          {metric.label}
        </span>
        {value !== null && (
          <button type="button" onClick={() => onChange(null)} className="min-h-8 text-sm text-accent underline underline-offset-2">
            Clear
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-1.5">
        {[1, 2, 3, 4, 5].map((step) => {
          const picked = value === step;
          return (
            <button
              key={step}
              type="button"
              aria-pressed={picked}
              aria-label={metric.words[step - 1]}
              data-measure={metric.key}
              data-step={step}
              onClick={() => onChange(picked ? null : step)}
              className={`h-12 flex-1 rounded-xl border-2 ${value !== null && step <= value ? "border-accent bg-accent" : "border-line bg-surface"} ${picked ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted" aria-hidden="true">
        <span>{metric.ends[0]}</span>
        <span>{metric.ends[1]}</span>
      </div>
      <p className="mt-1 text-sm" aria-live="polite" data-testid={`picked-${metric.key}`}>
        {value === null ? <span className="text-muted">Not picked. Read from your words if you wrote any.</span> : <span className="font-medium">{metric.words[value - 1]}</span>}
      </p>
    </div>
  );
}
