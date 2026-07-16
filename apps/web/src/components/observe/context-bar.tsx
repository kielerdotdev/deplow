import { useCallback, useMemo, useState } from "react"
import {
  ChevronDownIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react"

import { BaselinePicker } from "./baseline-picker"
import { FilterBuilder, FilterChips } from "./filter-builder"
import { ObserveFacets } from "./observe-facets"
import { QueryInput } from "./query-input"
import { SavedViewControls } from "./saved-view-controls"
import { TimeRangePicker } from "./time-range-picker"
import type { ObserveContext, QuerySpec } from "@/lib/observe/context"
import { cn } from "@/lib/utils"

export type ObserveSurface =
  | "default"
  | "traces"
  | "logs"
  | "explore"
  | "issues"

const PLACEHOLDERS: Record<ObserveSurface, string> = {
  default: "Search services, operations…",
  traces: "Search span names…",
  logs: "Search log messages…",
  explore: "Search services, operations…",
  issues: "Search issues by title or culprit…",
}

function emptyQuery(): QuerySpec {
  return {}
}

function hasActiveQuery(q: QuerySpec): boolean {
  return Boolean(
    q.q ||
      q.service ||
      q.operation ||
      q.traceId ||
      q.spanId ||
      q.release ||
      q.environment ||
      (q.spanScope && q.spanScope !== "root") ||
      q.errorsOnly ||
      (q.minDurationMs != null && q.minDurationMs > 0),
  )
}

function QueryDimChip({
  label,
  value,
  onRemove,
}: {
  label: string
  value: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
      <button
        type="button"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        <XIcon className="size-3" />
      </button>
    </span>
  )
}

export function ContextBar({
  context,
  onChange,
  onSaveView,
  className,
  showQuery = true,
  projectId,
  surface = "default",
  defaultExpanded = false,
}: {
  context: ObserveContext
  onChange: (next: ObserveContext) => void
  onSaveView?: (name: string) => void
  className?: string
  showQuery?: boolean
  projectId?: string
  surface?: ObserveSurface
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const filterCount = context.filters.length
  const hasBaseline = context.baseline.mode !== "none"
  const showFacets = surface === "traces" || surface === "explore"
  const signal = surface === "logs" ? "logs" : "spans"

  const setQuery = useCallback(
    (q: string) => {
      onChange({
        ...context,
        query: { ...context.query, q: q || undefined },
      })
    },
    [context, onChange],
  )

  const patchQuery = useCallback(
    (patch: Partial<QuerySpec>) => {
      onChange({
        ...context,
        query: { ...context.query, ...patch },
      })
    },
    [context, onChange],
  )

  const clearAll = useCallback(() => {
    onChange({
      ...context,
      filters: [],
      query: emptyQuery(),
      selection: undefined,
      baseline: { mode: "none" },
    })
  }, [context, onChange])

  const active = useMemo(
    () => filterCount > 0 || hasActiveQuery(context.query) || hasBaseline,
    [filterCount, context.query, hasBaseline],
  )

  const dimChips = useMemo(() => {
    const q = context.query
    const chips: Array<{
      key: string
      label: string
      value: string
      clear: Partial<QuerySpec>
    }> = []
    if (q.service) {
      chips.push({
        key: "svc",
        label: "service",
        value: q.service,
        clear: { service: undefined },
      })
    }
    if (q.operation) {
      chips.push({
        key: "op",
        label: "op",
        value: q.operation,
        clear: { operation: undefined },
      })
    }
    if (q.environment) {
      chips.push({
        key: "env",
        label: "env",
        value: q.environment,
        clear: { environment: undefined },
      })
    }
    if (q.release) {
      chips.push({
        key: "rel",
        label: "release",
        value: q.release,
        clear: { release: undefined },
      })
    }
    if (q.traceId) {
      chips.push({
        key: "tid",
        label: "trace",
        value: q.traceId.slice(0, 12) + "…",
        clear: { traceId: undefined },
      })
    }
    return chips
  }, [context.query])

  return (
    <div
      role="toolbar"
      aria-label="Observe context"
      data-testid="observe-context-bar"
      data-surface={surface}
      className={cn(
        "sticky top-12 z-10 -mx-3 mb-1 flex flex-col gap-2 border-y border-border/70 bg-background/70 px-3 py-2 backdrop-blur-xl md:-mx-5 md:px-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TimeRangePicker
          value={context.time}
          onChange={(time) => onChange({ ...context, time })}
        />

        {showQuery ? (
          <QueryInput
            value={context.query.q ?? ""}
            onChange={setQuery}
            placeholder={PLACEHOLDERS[surface]}
            className="max-w-md"
          />
        ) : null}

        {showFacets ? (
          <ObserveFacets
            context={context}
            onChange={onChange}
            projectId={projectId}
          />
        ) : null}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
            expanded && "bg-muted text-foreground",
          )}
          aria-expanded={expanded}
        >
          <SlidersHorizontalIcon className="size-3.5" />
          Filters
          {filterCount > 0 ? (
            <span className="rounded bg-muted px-1 tabular-nums text-[10px] text-foreground">
              {filterCount}
            </span>
          ) : null}
          <ChevronDownIcon
            className={cn(
              "size-3.5 opacity-60 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>

        {active ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
            Clear
          </button>
        ) : null}
      </div>

      {(filterCount > 0 || dimChips.length > 0) && !expanded ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChips
            filters={context.filters}
            onChange={(filters) => onChange({ ...context, filters })}
          />
          {dimChips.map((c) => (
            <QueryDimChip
              key={c.key}
              label={c.label}
              value={c.value}
              onRemove={() => patchQuery(c.clear)}
            />
          ))}
        </div>
      ) : null}

      {expanded ? (
        <div className="flex w-full flex-col gap-2.5 rounded-md border border-border bg-card px-3 py-2.5">
          <FilterBuilder
            filters={context.filters}
            onChange={(filters) => onChange({ ...context, filters })}
            projectId={projectId}
            signal={signal}
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
            {(surface === "explore" || surface === "default") && (
              <BaselinePicker
                value={context.baseline}
                onChange={(baseline) => onChange({ ...context, baseline })}
              />
            )}
            <div className="ml-auto">
              <SavedViewControls
                projectId={projectId}
                surface={surface === "default" ? undefined : surface}
                context={context}
                onSave={onSaveView}
                onLoad={onChange}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
