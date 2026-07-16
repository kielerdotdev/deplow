import type { TelemetryQuery } from "@/lib/observe/telemetry"
import { defaultTelemetryQuery } from "@/lib/observe/telemetry"
import { parseStoredQuery } from "@/lib/observe/telemetry"

/** Build a preview TelemetryQuery for the alert create dialog. */
export function alertPreviewQuery(input: {
  metric: string
  window: string
  contextJson?: string
}): TelemetryQuery {
  const stored = input.contextJson
    ? parseStoredQuery(input.contextJson)
    : defaultTelemetryQuery("traces")
  const windowMs =
    input.window === "1m"
      ? 60_000
      : input.window === "15m"
        ? 15 * 60_000
        : input.window === "1h"
          ? 60 * 60_000
          : 5 * 60_000
  const to = new Date()
  const from = new Date(to.getTime() - windowMs)
  const aggFn =
    input.metric === "error_rate"
      ? ("error_rate" as const)
      : input.metric === "rate"
        ? ("rate" as const)
        : input.metric === "duration_p95"
          ? ("p95" as const)
          : ("count" as const)

  return {
    ...stored,
    version: 1,
    timeRange: {
      kind: "absolute",
      from: from.toISOString(),
      to: to.toISOString(),
    },
    aggregation: {
      function: aggFn,
      field: stored.aggregation?.field ?? "duration",
      interval: "auto",
    },
    presentation: {
      ...stored.presentation,
      view: "timeseries",
      sort: "newest",
    },
  }
}

export function extractPreviewValue(result: {
  kind: string
  trends?: {
    number?: { value: number }
    points?: Array<{ values: Record<string, number | null> }>
  }
}): number | null {
  if (result.kind !== "timeseries" && result.kind !== "table") return null
  const trends = "trends" in result ? result.trends : undefined
  if (!trends) return null
  if (trends.number?.value != null) return trends.number.value
  const points = trends.points ?? []
  const last = points[points.length - 1]
  if (!last) return 0
  const vals = Object.values(last.values).filter(
    (v): v is number => typeof v === "number",
  )
  if (!vals.length) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}
