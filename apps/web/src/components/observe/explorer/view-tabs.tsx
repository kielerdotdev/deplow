import { cn } from "@/lib/utils"
import type { TelemetryView } from "@/lib/observe/telemetry"

const VIEWS: Array<{ id: TelemetryView; label: string; title: string }> = [
  { id: "traces", label: "Traces", title: "Root traces (one row per TraceId)" },
  { id: "list", label: "List", title: "Individual matching spans" },
  { id: "timeseries", label: "Time series", title: "Aggregated values over time" },
  { id: "table", label: "Table", title: "Aggregated values grouped into rows" },
]

export function ExplorerViewTabs({
  view,
  onChange,
  className,
}: {
  view: TelemetryView
  onChange: (view: TelemetryView) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-md border border-border p-0.5",
        className,
      )}
      role="tablist"
      aria-label="Explorer view"
      data-testid="explorer-view-tabs"
    >
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          title={v.title}
          aria-selected={view === v.id}
          className={cn(
            "min-h-8 rounded-[3px] px-2.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            view === v.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
