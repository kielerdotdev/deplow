import { useEffect, useMemo, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  ChartFrame,
  DataTable,
  ObserveEmptyState,
  ObserveOnboarding,
  ObservePageLayout,
  ObserveProjectShell,
  ResultTable,
  ServiceDot,
  TrendsChart,
  VisualizationCanvas,
} from "@/components/observe"
import {
  ExplorerActions,
  ExplorerAggBar,
  ExplorerExpressionInput,
  ExplorerFacetPanel,
  ExplorerFormulaBar,
  ExplorerTraceMatchPanel,
  ExplorerViewTabs,
} from "@/components/observe/explorer"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import {
  applyColdDefaults,
  parseContext,
  serializeTraceSearch,
  type ObserveContext,
} from "@/lib/observe/context"
import {
  contextToTelemetryQuery,
  parseTelemetryQuery,
  serializeTelemetryQuery,
  summarizeTelemetryQuery,
  telemetryQueryToContext,
  type TelemetryQuery,
} from "@/lib/observe/telemetry"
import {
  defaultTrendsQuery,
  emptyFilterGroup,
  type TrendsQuery,
} from "@/lib/observe/trends"
import { client } from "@/lib/orpc"

function toTrendsQuery(q: TelemetryQuery): TrendsQuery {
  const base = defaultTrendsQuery()
  const measure =
    q.aggregation?.function === "count_distinct"
      ? "distinct_attr"
      : (q.aggregation?.function ?? "count")
  return {
    ...base,
    time: q.timeRange,
    interval: q.aggregation?.interval ?? "auto",
    filters: q.filter ?? emptyFilterGroup(),
    series: [
      {
        id: "A",
        letter: "A",
        label: q.presentation.legend ?? String(measure),
        signal:
          q.scope === "root"
            ? "root_spans"
            : q.signal === "logs"
              ? "logs"
              : "spans",
        measure: measure as TrendsQuery["series"][0]["measure"],
        field: q.aggregation?.field,
        filters: [],
      },
    ],
    breakdowns: (q.groupBy ?? []).map((field) => ({
      field,
      topN: 25,
      rankBy: "count" as const,
      otherBucket: true,
    })),
    viz: {
      kind: q.presentation.view === "table" ? "table" : "line",
      referenceLines: [],
    },
  }
}

export const Route = createFileRoute("/observe/projects/$projectId/traces")({
  validateSearch: (search) => {
    const raw = search as Record<string, unknown>
    if (typeof raw.tq === "string" && raw.tq.length > 0) {
      return serializeTelemetryQuery(parseTelemetryQuery(raw))
    }
    // Legacy ObserveContext URL → lift into TelemetryQuery
    const ctx = parseContext(applyColdDefaults("traces", raw))
    return serializeTelemetryQuery(contextToTelemetryQuery(ctx, "traces"))
  },
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    await client.observe.projects.enable({ projectId: params.projectId }).catch(
      () => null,
    )
    const project = await client.projects.get({ id: params.projectId })
    return { project }
  },
  component: TracesExplorerPage,
})

function TracesExplorerPage() {
  const { project } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const query = parseTelemetryQuery(search as Record<string, unknown>, "traces")
  const context: ObserveContext = telemetryQueryToContext(query)

  const [result, setResult] = useState<Awaited<
    ReturnType<typeof client.observe.query.run>
  > | null>(null)
  const [state, setState] = useState<"loading" | "idle" | "error" | "empty">(
    "loading",
  )
  const [cold, setCold] = useState(false)

  function setQuery(next: TelemetryQuery) {
    void navigate({ search: serializeTelemetryQuery(next), replace: true })
  }

  function setContext(next: ObserveContext) {
    setQuery(contextToTelemetryQuery(next, "traces"))
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setState("loading")
      try {
        const [run, services] = await Promise.all([
          client.observe.query.run({ projectId, query }),
          client.observe.services
            .list({
              projectId,
              from:
                query.timeRange.kind === "absolute"
                  ? query.timeRange.from
                  : new Date(Date.now() - 3600_000).toISOString(),
              to:
                query.timeRange.kind === "absolute"
                  ? query.timeRange.to
                  : new Date().toISOString(),
            })
            .catch(() => []),
        ])
        if (cancelled) return
        setResult(run)
        const empty =
          (run.result.kind === "traces" && run.result.rows.length === 0) ||
          (run.result.kind === "list" && run.result.rows.length === 0) ||
          (run.result.kind === "timeseries" &&
            run.result.trends.points.length === 0) ||
          (run.result.kind === "table" &&
            run.result.trends.points.length === 0)
        const isCold = services.length === 0 && empty
        setCold(isCold)
        setState(isCold ? "empty" : "idle")
      } catch {
        if (!cancelled) setState("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, search])

  const summary = useMemo(() => summarizeTelemetryQuery(query), [query])

  if (cold && state === "empty") {
    return (
      <ObserveProjectShell
        projectId={projectId}
        title="Traces"
        description={project.name}
      >
        <ObserveOnboarding projectId={projectId} surface="traces" />
      </ObserveProjectShell>
    )
  }

  const view = query.presentation.view
  const showAgg = view === "timeseries" || view === "table"

  return (
    <ObserveProjectShell
      projectId={projectId}
      title="Traces"
      description={`${project.name} · ${summary}`}
      context={context}
      onContextChange={setContext}
      onSaveView={(name) => {
        void client.observe.savedViews.create({
          projectId,
          name,
          surface: "explorer",
          contextJson: JSON.stringify(query),
        })
      }}
    >
      <ObservePageLayout.Root>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ExplorerViewTabs
          view={view}
          onChange={(v) =>
            setQuery({
              ...query,
              presentation: { ...query.presentation, view: v },
              aggregation:
                v === "timeseries" || v === "table"
                  ? query.aggregation ?? {
                      function: "count",
                      interval: "auto",
                    }
                  : query.aggregation,
            })
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <ObservePageLayout.FilterSidebarTrigger />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Scope
            <select
              className="min-h-8 rounded border border-border bg-background px-2 text-xs text-foreground"
              value={query.scope ?? "root"}
              onChange={(e) =>
                setQuery({
                  ...query,
                  scope: e.target.value as TelemetryQuery["scope"],
                })
              }
            >
              <option value="root">Root spans</option>
              <option value="entrypoint">Entrypoint</option>
              <option value="all">All spans</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Sort
            <select
              className="min-h-8 rounded border border-border bg-background px-2 text-xs text-foreground"
              value={query.presentation.sort ?? "newest"}
              onChange={(e) =>
                setQuery({
                  ...query,
                  presentation: {
                    ...query.presentation,
                    sort: e.target.value as "newest" | "slowest" | "errors",
                  },
                })
              }
            >
              <option value="newest">Newest</option>
              <option value="slowest">Slowest</option>
              <option value="errors">Most errors</option>
            </select>
          </label>
        </div>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">{summary}</p>

      <ExplorerExpressionInput
        projectId={projectId}
        query={query}
        onChange={setQuery}
        className="mb-3"
        signal="spans"
      />

      {showAgg ? (
        <>
          <ExplorerAggBar
            query={query}
            onChange={setQuery}
            className="mb-3"
          />
          <ExplorerFormulaBar
            query={query}
            onChange={setQuery}
            className="mb-3"
          />
        </>
      ) : null}

      <ExplorerTraceMatchPanel
        query={query}
        onChange={setQuery}
        className="mb-3"
      />

      <ObservePageLayout.Body>
        <ObservePageLayout.FilterSidebar>
          <ExplorerFacetPanel
            projectId={projectId}
            query={query}
            onChange={setQuery}
          />
        </ObservePageLayout.FilterSidebar>

        <ObservePageLayout.Content>
          {(view === "traces" || view === "list") &&
          result?.result.kind === "traces" ? (
            <>
              <ChartFrame
                title="Trace volume"
                description="Count over time · brush or click to dig in"
                state={
                  state === "error"
                    ? "error"
                    : state === "loading"
                      ? "loading"
                      : "idle"
                }
              >
                <VisualizationCanvas
                  kind="bar"
                  series={result.result.histogram.map((h) => ({
                    t: h.t,
                    v: h.count,
                  }))}
                  height={140}
                  valueLabel="Traces"
                  onBrush={(_a, _b, from, to) => {
                    setQuery({
                      ...query,
                      timeRange: {
                        kind: "absolute",
                        from: new Date(from.t).toISOString(),
                        to: new Date(to.t).toISOString(),
                      },
                    })
                  }}
                />
              </ChartFrame>
              <DataTable
                state={
                  state === "error"
                    ? "error"
                    : state === "loading"
                      ? "loading"
                      : "idle"
                }
                rows={result.result.rows.map((t) => ({
                  id: t.trace_id,
                  ...t,
                }))}
                emptyTitle="No traces in this window"
                emptyDescription="Widen the time range or clear filters."
                emptyVariant="no_match"
                columns={[
                  {
                    id: "root",
                    header: "Root operation",
                    cell: (r) => (
                      <Link
                        to="/observe/projects/$projectId/traces/$traceId"
                        params={{ projectId, traceId: r.trace_id }}
                        search={serializeTraceSearch(context)}
                        className="font-medium hover:underline"
                      >
                        {r.root_name}
                      </Link>
                    ),
                  },
                  {
                    id: "svc",
                    header: "Service",
                    cell: (r) => (
                      <span className="inline-flex items-center gap-1.5">
                        <ServiceDot serviceName={r.service} />
                        {r.service}
                      </span>
                    ),
                  },
                  {
                    id: "dur",
                    header: "Duration",
                    cell: (r) => (
                      <span className="font-mono tabular-nums">
                        {r.duration_ms.toFixed(0)} ms
                      </span>
                    ),
                  },
                  {
                    id: "spans",
                    header: "Spans",
                    cell: (r) => (
                      <span className="tabular-nums">{r.span_count}</span>
                    ),
                  },
                  {
                    id: "err",
                    header: "Errors",
                    cell: (r) => (
                      <span className="tabular-nums">{r.error_count}</span>
                    ),
                  },
                ]}
              />
            </>
          ) : null}

          {view === "list" && result?.result.kind === "list" ? (
            <DataTable
              state={
                state === "error"
                  ? "error"
                  : state === "loading"
                    ? "loading"
                    : "idle"
              }
              rows={(result.result.rows as Array<{
                trace_id: string
                span_id: string
                service: string
                name: string
                duration_ms: number
                status: string
                start: string
              }>).map((r) => ({ id: r.span_id, ...r }))}
              emptyTitle="No spans in this window"
              emptyDescription="Widen the time range or clear filters."
              emptyVariant="no_match"
              columns={[
                {
                  id: "name",
                  header: "Span",
                  cell: (r) => (
                    <Link
                      to="/observe/projects/$projectId/traces/$traceId"
                      params={{ projectId, traceId: r.trace_id }}
                      search={serializeTraceSearch(context)}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                  ),
                },
                {
                  id: "svc",
                  header: "Service",
                  cell: (r) => (
                    <span className="inline-flex items-center gap-1.5">
                      <ServiceDot serviceName={r.service} />
                      {r.service}
                    </span>
                  ),
                },
                {
                  id: "dur",
                  header: "Duration",
                  cell: (r) => (
                    <span className="font-mono tabular-nums">
                      {r.duration_ms.toFixed(0)} ms
                    </span>
                  ),
                },
                { id: "status", header: "Status", cell: (r) => r.status },
              ]}
            />
          ) : null}

          {(view === "timeseries" || view === "table") &&
          (result?.result.kind === "timeseries" ||
            result?.result.kind === "table") ? (
            view === "timeseries" ? (
              <ChartFrame
                title="Time series"
                description={summary}
                state={
                  state === "error"
                    ? "error"
                    : state === "loading"
                      ? "loading"
                      : "idle"
                }
              >
                <TrendsChart
                  query={toTrendsQuery(query)}
                  result={result.result.trends}
                  hiddenKeys={new Set()}
                  height={280}
                />
              </ChartFrame>
            ) : (
              <ResultTable
                result={result.result.trends}
                hiddenKeys={new Set()}
                onToggleKey={() => {}}
              />
            )
          ) : null}

          <ExplorerActions projectId={projectId} query={query} />

          {state === "error" ? (
            <ObserveEmptyState
              variant="error"
              className="mt-3"
              action={
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => void navigate({ search })}
                >
                  Retry
                </Button>
              }
            />
          ) : null}
        </ObservePageLayout.Content>
      </ObservePageLayout.Body>
      </ObservePageLayout.Root>
    </ObserveProjectShell>
  )
}
