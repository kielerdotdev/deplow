import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { client } from "@/lib/orpc"
import type { TelemetryQuery } from "@/lib/observe/telemetry"
import { emptyFilterGroup } from "@/lib/observe/telemetry"

type Facet = {
  field: string
  buckets: Array<{ value: string; count: number }>
  otherCount: number
}

const FIELD_LABELS: Record<string, string> = {
  service: "Service",
  environment: "Environment",
  operation: "Span name",
  status: "Status",
  "http.method": "HTTP method",
  "http.route": "HTTP route",
  "http.status_code": "HTTP status",
  "host.name": "Host",
  severity: "Severity",
}

export function ExplorerFacetPanel({
  projectId,
  query,
  onChange,
  className,
}: {
  projectId: string
  query: TelemetryQuery
  onChange: (next: TelemetryQuery) => void
  className?: string
}) {
  const [facets, setFacets] = useState<Facet[]>([])
  const [loading, setLoading] = useState(true)

  // Stabilize refetch key — full query object identity churns every render.
  const facetKey = JSON.stringify({
    signal: query.signal,
    timeRange: query.timeRange,
    scope: query.scope,
    environment: query.environment,
    filter: query.filter,
    q: query.q,
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void client.observe.query
      .facets({ projectId, query })
      .then((rows) => {
        if (!cancelled) {
          setFacets(rows)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFacets([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- facetKey captures query slice
  }, [projectId, facetKey])

  function toggle(field: string, value: string) {
    const filter = query.filter ?? emptyFilterGroup()
    const existing = filter.clauses.findIndex(
      (c) => c.key === field && c.op === "eq" && c.value === value,
    )
    const clauses =
      existing >= 0
        ? filter.clauses.filter((_, i) => i !== existing)
        : [...filter.clauses, { key: field, op: "eq" as const, value }]
    onChange({
      ...query,
      filter: { ...filter, clauses },
      environment:
        field === "environment"
          ? existing >= 0
            ? undefined
            : [value]
          : query.environment,
    })
  }

  function isActive(field: string, value: string) {
    return query.filter.clauses.some(
      (c) => c.key === field && c.op === "eq" && c.value === value,
    )
  }

  return (
    <aside
      className={cn(
        "w-full shrink-0 space-y-3 border-r border-border pr-3 md:w-52",
        className,
      )}
      data-testid="explorer-facet-panel"
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Quick filters
      </div>
      {loading && facets.length === 0 ? (
        <p className="text-xs text-muted-foreground">Loading facets…</p>
      ) : null}
      {facets.map((facet) => (
        <div key={facet.field} className="space-y-1">
          <div className="text-xs font-medium text-foreground">
            {FIELD_LABELS[facet.field] ?? facet.field}
          </div>
          {facet.buckets.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No values</p>
          ) : (
            <ul className="space-y-0.5">
              {facet.buckets.map((b) => {
                const active = isActive(facet.field, b.value)
                return (
                  <li key={b.value}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full min-h-8 items-center justify-between gap-2 rounded px-1.5 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                      onClick={() => toggle(facet.field, b.value)}
                    >
                      <span className="truncate">{b.value}</span>
                      <span className="shrink-0 tabular-nums text-[11px]">
                        {b.count.toLocaleString()}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ))}
    </aside>
  )
}
