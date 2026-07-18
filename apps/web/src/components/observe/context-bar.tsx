import { useCallback, useMemo, useState } from "react"
import {
  ChevronDownIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react"

import { AdvancedFilterDialog } from "./advanced-filter-dialog"
import { BaselinePicker } from "./baseline-picker"
import { FilterBuilder, FilterChips } from "./filter-builder"
import { ObserveFacets } from "./observe-facets"
import { QueryInput } from "./query-input"
import { SavedViewControls } from "./saved-view-controls"
import { TimeRangePicker } from "./time-range-picker"
import type { ObserveContext, QuerySpec } from "@/lib/observe/context"
import {
  applyWhereClauseToContext,
  contextToWhereClause,
} from "@/lib/observe/where-clause"
import { cn } from "@/lib/utils"

export type ObserveSurface =
  | "default"
  | "traces"
  | "logs"
  | "issues"

const PLACEHOLDERS: Record<ObserveSurface, string> = {
  default: "Search services, operations…",
  traces: "Search span names…",
  logs: "Search log messages…",
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
  const showFacets = surface === "traces"
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

  const whereText = useMemo(
    () => contextToWhereClause(context.filters, context.query),
    [context.filters, context.query],
  )

  const applyWhere = useCallback(
    (where: string) => {
      if (!where.trim()) {
        onChange({
          ...context,
          filters: [],
          query: {
            ...context.query,
            service: undefined,
            operation: undefined,
            environment: undefined,
            errorsOnly: undefined,
            minDurationMs: undefined,
          },
        })
        return
      }
      const next = applyWhereClauseToContext(where, {
        filters: context.filters,
        query: context.query,
      })
      onChange({
        ...context,
        filters: next.filters,
        query: next.query,
      })
    },
    [context, onChange],
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

  const hasErrorsOnly = context.query.errorsOnly === true
  const chipCount =
    filterCount + dimChips.length + (hasErrorsOnly ? 1 : 0)

  return (
    <div
      role="toolbar"
      aria-label="Observe context"
      data-testid="observe-context-bar"
      data-surface={surface}
      className={cn(
        "flex flex-col gap-2 rounded-sm border border-border/60 bg-muted/20 px-2 py-2",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TimeRangePicker
          value={context.time}
          onChange={(time) => onChange({ ...context, time })}
          hotkey
        />

        {showQuery ? (
          <QueryInput
            value={context.query.q ?? ""}
            onChange={setQuery}
            placeholder={PLACEHOLDERS[surface]}
            className="min-w-[12rem] max-w-none flex-1 basis-[14rem]"
            shortcutFocus
          />
        ) : null}

        {showFacets ? (
          <ObserveFacets
            context={context}
            onChange={onChange}
            projectId={projectId}
          />
        ) : null}

        {(surface === "traces" || surface === "logs") && (
          <AdvancedFilterDialog
            initialValue={whereText}
            onApply={applyWhere}
          />
        )}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "inline-flex h-8 min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            expanded || chipCount > 0
              ? "border-border bg-muted text-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
          aria-expanded={expanded}
          aria-controls="observe-advanced-filters"
          data-active={expanded || chipCount > 0 ? "" : undefined}
        >
          <SlidersHorizontalIcon className="size-3.5" aria-hidden />
          Filters
          {chipCount > 0 ? (
            <span className="rounded-md bg-background/80 px-1.5 py-0.5 tabular-nums text-[11px] text-foreground">
              {chipCount}
            </span>
          ) : null}
          <ChevronDownIcon
            className={cn(
              "size-3.5 opacity-60 transition-transform motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {active ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-8 min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="context-bar-clear-filters"
          >
            <XIcon className="size-3.5" aria-hidden />
            Clear filters
          </button>
        ) : null}

        {onSaveView || projectId ? (
          <div className="ml-auto flex items-center gap-2">
            <SavedViewControls
              projectId={projectId}
              surface={surface === "default" ? undefined : surface}
              context={context}
              onSave={onSaveView}
              onLoad={onChange}
            />
          </div>
        ) : null}
      </div>

      {(filterCount > 0 || dimChips.length > 0 || hasErrorsOnly) &&
      !expanded ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          data-testid="active-filter-summary"
          aria-label="Active filters"
        >
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
          {hasErrorsOnly ? (
            <QueryDimChip
              label="level"
              value="errors only"
              onRemove={() => patchQuery({ errorsOnly: undefined })}
            />
          ) : null}
        </div>
      ) : null}

      {expanded ? (
        <div
          id="observe-advanced-filters"
          className="flex w-full flex-col gap-3 border-t border-border pt-2.5"
          data-testid="advanced-filter-panel"
        >
          {surface === "issues" ? (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={hasErrorsOnly}
                onChange={(e) =>
                  patchQuery({
                    errorsOnly: e.target.checked ? true : undefined,
                  })
                }
              />
              Errors only
            </label>
          ) : null}
          <FilterBuilder
            filters={context.filters}
            onChange={(filters) => onChange({ ...context, filters })}
            projectId={projectId}
            signal={signal}
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
            {surface === "default" && (
              <BaselinePicker
                value={context.baseline}
                onChange={(baseline) => onChange({ ...context, baseline })}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
