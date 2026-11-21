import { labelFor, wordFor, type MetricKey } from "@/lib/metrics";

/** Five small steps, filled up to the score: a direction, never a number. */
export function Steps({ score }: { score: number | null }) {
  const filled = score === null ? 0 : Math.round(score);
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`h-2 w-5 rounded-full ${n <= filled ? "bg-accent" : "bg-line"}`} />
      ))}
    </span>
  );
}

export function MeasureRow({ name, score, own = false }: { name: MetricKey | "combined"; score: number | null; own?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <div className="text-sm text-muted">{labelFor(name)}</div>
        <div className="font-medium">{wordFor(name, score)}</div>
        {own && <div className="text-sm text-muted">You picked this</div>}
      </div>
      <Steps score={score} />
    </div>
  );
}

