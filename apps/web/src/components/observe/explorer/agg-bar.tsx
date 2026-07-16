import { cn } from "@/lib/utils"
import type { TelemetryAggFn, TelemetryQuery } from "@/lib/observe/telemetry"

const AGGS: Array<{ id: TelemetryAggFn; label: string }> = [
  { id: "count", label: "Count" },
  { id: "rate", label: "Rate" },
  { id: "avg", label: "Avg duration" },
  { id: "p50", label: "P50" },
  { id: "p95", label: "P95" },
  { id: "p99", label: "P99" },
  { id: "error_rate", label: "Error rate" },
]

const GROUP_FIELDS = [
  { id: "service", label: "Service" },
  { id: "operation", label: "Operation" },
  { id: "environment", label: "Environment" },
  { id: "http.route", label: "HTTP route" },
]

/** Shown for timeseries/table views — progressive aggregation controls. */
export function ExplorerAggBar({
  query,
  onChange,
  className,
}: {
  query: TelemetryQuery
  onChange: (next: TelemetryQuery) => void
  className?: string
}) {
  const fn = query.aggregation?.function ?? "count"
  const groupBy = query.groupBy?.[0] ?? ""

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/30 px-3 py-2",
        className,
      )}
      data-testid="explorer-agg-bar"
    >
      <label className="space-y-1 text-[11px] text-muted-foreground">
        Calculate
        <select
          className="block min-h-8 rounded border border-border bg-background px-2 text-xs text-foreground"
          value={fn}
          onChange={(e) =>
            onChange({
              ...query,
              aggregation: {
                function: e.target.value as TelemetryAggFn,
                field:
                  e.target.value.startsWith("p") ||
                  e.target.value === "avg" ||
                  e.target.value === "sum"
                    ? "duration"
                    : query.aggregation?.field,
                interval: query.aggregation?.interval ?? "auto",
              },
            })
          }
        >
          {AGGS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-[11px] text-muted-foreground">
        Group by
        <select
          className="block min-h-8 rounded border border-border bg-background px-2 text-xs text-foreground"
          value={groupBy}
          onChange={(e) =>
            onChange({
              ...query,
              groupBy: e.target.value ? [e.target.value] : [],
            })
          }
        >
          <option value="">None</option>
          {GROUP_FIELDS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-[11px] text-muted-foreground">
        Every
        <select
          className="block min-h-8 rounded border border-border bg-background px-2 text-xs text-foreground"
          value={query.aggregation?.interval ?? "auto"}
          onChange={(e) =>
            onChange({
              ...query,
              aggregation: {
                function: fn,
                field: query.aggregation?.field,
                interval: e.target.value as NonNullable<
                  TelemetryQuery["aggregation"]
                >["interval"],
              },
            })
          }
        >
          <option value="auto">Auto</option>
          <option value="1m">1 minute</option>
          <option value="5m">5 minutes</option>
          <option value="15m">15 minutes</option>
          <option value="1h">1 hour</option>
        </select>
      </label>
    </div>
  )
}
