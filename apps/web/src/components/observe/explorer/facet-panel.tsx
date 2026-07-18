import { useEffect, useMemo, useState } from "react"

import {
  FilterSection,
  SearchableFilterSection,
  SingleCheckboxFilter,
} from "@/components/observe/filter-section"
import {
  FilterSidebarBody,
  FilterSidebarError,
  FilterSidebarFrame,
  FilterSidebarHeader,
  FilterSidebarLoading,
} from "@/components/observe/filter-sidebar"
import { Separator } from "@/components/ui/separator"
import { emptyFilterGroup } from "@/lib/observe/telemetry"
import type { TelemetryQuery } from "@/lib/observe/telemetry"
import { serviceColorMap } from "@/lib/observe/service-color"
import { client } from "@/lib/orpc"

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

const SEARCHABLE = new Set([
  "service",
  "operation",
  "http.route",
  "host.name",
])

function selectedForField(query: TelemetryQuery, field: string): string[] {
  return query.filter.clauses
    .filter((c) => c.key === field && c.op === "eq" && c.value)
    .map((c) => c.value!)
}

function hasErrorSelected(query: TelemetryQuery): boolean {
  return query.filter.clauses.some(
    (c) =>
      (c.key === "status" && c.op === "eq" && c.value === "error") ||
      (c.key === "has_error" && c.op === "eq" && c.value === "true"),
  )
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
  const [error, setError] = useState(false)
  const [retryToken, setRetryToken] = useState(0)

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
    setError(false)
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
          setError(true)
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- facetKey captures query slice
  }, [projectId, facetKey, retryToken])

  const serviceColors = useMemo(() => {
    const svc = facets.find((f) => f.field === "service")
    return svc ? serviceColorMap(svc.buckets.map((b) => b.value)) : {}
  }, [facets])

  const activeCount = query.filter.clauses.length

  function setFieldSelected(field: string, selected: string[]) {
    const filter = query.filter ?? emptyFilterGroup()
    const others = filter.clauses.filter((c) => !(c.key === field && c.op === "eq"))
    const nextClauses = [
      ...others,
      ...selected.map((value) => ({
        key: field,
        op: "eq" as const,
        value,
      })),
    ]
    onChange({
      ...query,
      filter: { ...filter, clauses: nextClauses },
      environment:
        field === "environment"
          ? selected.length > 0
            ? selected
            : undefined
          : query.environment,
    })
  }

  function setHasError(checked: boolean) {
    const filter = query.filter ?? emptyFilterGroup()
    const without = filter.clauses.filter(
      (c) =>
        !(
          (c.key === "status" && c.op === "eq" && c.value === "error") ||
          (c.key === "has_error" && c.op === "eq")
        ),
    )
    onChange({
      ...query,
      filter: {
        ...filter,
        clauses: checked
          ? [...without, { key: "status", op: "eq", value: "error" }]
          : without,
      },
    })
  }

  function clearAll() {
    onChange({
      ...query,
      filter: emptyFilterGroup(),
      environment: undefined,
    })
  }

  if (loading && facets.length === 0) {
    return (
      <div className={className} data-testid="explorer-facet-panel">
        <FilterSidebarLoading sectionCount={4} />
      </div>
    )
  }

  if (error && facets.length === 0) {
    return (
      <div className={className} data-testid="explorer-facet-panel">
        <FilterSidebarError
          onRetry={() => setRetryToken((n) => n + 1)}
        />
      </div>
    )
  }

  const errorFacet = facets.find((f) => f.field === "status")
  const errorCount =
    errorFacet?.buckets.find((b) => b.value === "error")?.count ??
    errorFacet?.buckets.reduce(
      (sum, b) =>
        sum + (b.value === "error" || b.value === "ERROR" ? b.count : 0),
      0,
    )

  return (
    <div className={className} data-testid="explorer-facet-panel">
      <FilterSidebarFrame waiting={loading}>
        <FilterSidebarHeader
          canClear={activeCount > 0}
          onClear={clearAll}
        />
        <FilterSidebarBody>
          {query.signal !== "logs" ? (
            <>
              <SingleCheckboxFilter
                title="Has Error"
                checked={hasErrorSelected(query)}
                onChange={setHasError}
                count={errorCount}
              />
              <Separator className="my-2" />
            </>
          ) : null}

          {facets.map((facet) => {
            const options = facet.buckets.map((b) => ({
              name: b.value,
              count: b.count,
            }))
            const selected = selectedForField(query, facet.field)
            const title = FIELD_LABELS[facet.field] ?? facet.field
            const Section = SEARCHABLE.has(facet.field)
              ? SearchableFilterSection
              : FilterSection
            return (
              <div key={facet.field}>
                <Section
                  title={title}
                  options={options}
                  selected={selected}
                  onChange={(next) => setFieldSelected(facet.field, next)}
                  colorMap={
                    facet.field === "service" ? serviceColors : undefined
                  }
                  maxVisible={facet.field === "service" ? 8 : 5}
                />
                <Separator className="my-1" />
              </div>
            )
          })}
        </FilterSidebarBody>
      </FilterSidebarFrame>
    </div>
  )
}
