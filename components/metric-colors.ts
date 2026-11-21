import type { MetricKey } from "@/lib/metrics";

// The colour each metric's strand is drawn in, everywhere it appears.
export const METRIC_COLOR: Record<MetricKey, string> = {
  itchiness: "var(--color-itch)",
  comfort: "var(--color-comfort)",
  mobility: "var(--color-mobility)",
};
