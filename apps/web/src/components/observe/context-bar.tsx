import { useState } from "react"
import { ChevronDownIcon, SlidersHorizontalIcon } from "lucide-react"

import { BaselinePicker } from "./baseline-picker"
import { FilterBuilder } from "./filter-builder"
import { QueryInput } from "./query-input"
import { SavedViewControls } from "./saved-view-controls"
import { TimeRangePicker } from "./time-range-picker"
import type { ObserveContext, TimeRange } from "@/lib/observe/context"
import { cn } from "@/lib/utils"

function timeLabel(time: TimeRange): string {
  if (time.kind === "preset") {
    const map: Record<string, string> = {
      "15m": "15m",
      "1h": "1h",
      "6h": "6h",
      "24h": "24h",
      "7d": "7d",
      "14d": "14d",
      "30d": "30d",
    }
    return map[time.preset] ?? time.preset
  }
  return "Custom"
}

export function ContextBar({
  context,
  onChange,
  onSaveView,
  className,
  showQuery = true,
  /** Collapsed by default — expand for filters / baseline / saved views */
  defaultExpanded = false,
}: {
  context: ObserveContext
  onChange: (next: ObserveContext) => void
  onSaveView?: (name: string) => void
  className?: string
  showQuery?: boolean
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const filterCount = context.filters.length
  const hasBaseline = context.baseline.mode !== "none"

  return (
    <div
      role="toolbar"
      aria-label="Observe context"
      className={cn(
        "sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2",
        className,
      )}
    >
      <TimeRangePicker
        value={context.time}
        onChange={(time) => onChange({ ...context, time })}
      />

      {showQuery ? (
        <QueryInput
          value={context.query.q ?? ""}
          onChange={(q) =>
            onChange({ ...context, query: { ...context.query, q } })
          }
          className="max-w-xs flex-1"
        />
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background/80 px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
          expanded && "border-border bg-muted/40 text-foreground",
        )}
        aria-expanded={expanded}
      >
        <SlidersHorizontalIcon className="size-3.5" />
        Filters
        {filterCount > 0 || hasBaseline ? (
          <span className="rounded bg-muted px-1 tabular-nums text-[10px]">
            {filterCount + (hasBaseline ? 1 : 0)}
          </span>
        ) : null}
        <ChevronDownIcon
          className={cn(
            "size-3.5 opacity-60 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
        <span className="hidden sm:inline">Range</span>
        <span className="font-medium text-foreground/80">
          {timeLabel(context.time)}
        </span>
      </div>

      {expanded ? (
        <div className="surface-panel flex w-full flex-col gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <BaselinePicker
              value={context.baseline}
              onChange={(baseline) => onChange({ ...context, baseline })}
            />
            <div className="ml-auto">
              <SavedViewControls context={context} onSave={onSaveView} />
            </div>
          </div>
          <FilterBuilder
            filters={context.filters}
            onChange={(filters) => onChange({ ...context, filters })}
          />
        </div>
      ) : null}
    </div>
  )
}
