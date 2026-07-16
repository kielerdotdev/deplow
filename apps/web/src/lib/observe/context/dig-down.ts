import type { ObserveContext, Selection } from "@/lib/observe/context"

/** Zoom Context time to an absolute window (graph dig-down). */
export function digDownTime(
  context: ObserveContext,
  fromMs: number,
  toMs: number,
): ObserveContext {
  const from = Math.min(fromMs, toMs)
  const to = Math.max(fromMs, toMs)
  // Ensure a usable minimum window (~30s)
  const pad = Math.max(30_000 - (to - from), 0) / 2
  return {
    ...context,
    time: {
      kind: "absolute",
      from: new Date(from - pad).toISOString(),
      to: new Date(to + pad).toISOString(),
    },
  }
}

/** Dig into a heatmap cell as Explore selection + tight time window. */
export function digDownHeatCell(
  context: ObserveContext,
  cell: { x: number; y: number; v: number },
  opts?: { timeBucketMs?: number; durationBucketMs?: number },
): ObserveContext {
  const timeBucketMs = opts?.timeBucketMs ?? 15 * 60_000
  const durationBucketMs = opts?.durationBucketMs ?? 625
  const selection: Selection = {
    timeFrom: new Date(cell.x).toISOString(),
    timeTo: new Date(cell.x + timeBucketMs).toISOString(),
    yMin: cell.y,
    yMax: cell.y + durationBucketMs,
    yAxis: "duration_ms",
  }
  return {
    ...digDownTime(context, cell.x, cell.x + timeBucketMs),
    selection,
    baseline:
      context.baseline.mode === "none"
        ? { mode: "previous" }
        : context.baseline,
    tab: context.tab ?? "anomalies",
  }
}
