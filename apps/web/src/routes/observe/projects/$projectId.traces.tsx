import { useEffect, useMemo, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  ChartFrame,
  DataTable,
  ObserveEmptyState,
  ObserveOnboarding,
  ObserveProjectShell,
  VisualizationCanvas,
} from "@/components/observe"
import { getSession } from "@/lib/auth.functions"
import {
  applyColdDefaults,
  contextToApiInput,
  digDownTime,
  parseContext,
  serializeContext,
  serializeTraceSearch,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"

function scopeDescription(
  spanScope: string | undefined,
  errorsOnly: boolean | undefined,
): string {
  const scope =
    spanScope === "all"
      ? "all spans"
      : spanScope === "entrypoint"
        ? "entrypoints"
        : "root spans"
  return errorsOnly ? `${scope} · errors only` : scope
}

export const Route = createFileRoute("/observe/projects/$projectId/traces")({
  validateSearch: (search) =>
    serializeContext(
      parseContext(
        applyColdDefaults("traces", search as Record<string, unknown>),
      ),
    ),
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
  component: TracesPage,
})

function TracesPage() {
  const { project } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const context = parseContext(search)
  const [rows, setRows] = useState<
    Array<{
      id: string
      trace_id: string
      service: string
      root_name: string
      duration_ms: number
      span_count: number
      error_count: number
      status: string
      start: string
    }>
  >([])
  const [hist, setHist] = useState<Array<{ t: number; v: number }>>([])
  const [errorHist, setErrorHist] = useState(0)
  const [state, setState] = useState<"loading" | "idle" | "error" | "empty">(
    "loading",
  )
  const [cold, setCold] = useState(false)

  function setContext(next: ObserveContext) {
    void navigate({ search: serializeContext(next), replace: true })
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setState("loading")
      try {
        const input = contextToApiInput(projectId, context)
        const [list, histogram, services] = await Promise.all([
          client.observe.traces.list(input),
          client.observe.traces.histogram(input),
          client.observe.services.list(input).catch(() => []),
        ])
        if (cancelled) return
        setRows(
          list.map((t) => ({
            id: t.trace_id,
            ...t,
          })),
        )
        setHist(histogram.map((h) => ({ t: h.t, v: h.count })))
        setErrorHist(
          histogram.reduce((s, h) => s + (("errors" in h ? Number(h.errors) : 0) || 0), 0),
        )
        const isCold = services.length === 0 && list.length === 0
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

  const summary = useMemo(() => {
    const count = rows.length
    const errors = rows.reduce((s, r) => s + (r.error_count ?? 0), 0)
    const median =
      count === 0
        ? 0
        : [...rows.map((r) => r.duration_ms)].sort((a, b) => a - b)[
            Math.floor(count / 2)
          ] ?? 0
    return { count, errors, median }
  }, [rows])

  if (cold && state === "empty") {
    return (
      <ObserveProjectShell
        projectId={projectId}
        title="Traces"
        description={project.name}
      >
        <ObserveOnboarding projectId={projectId} />
      </ObserveProjectShell>
    )
  }

  return (
    <ObserveProjectShell
      projectId={projectId}
      title="Traces"
      description={`${project.name} · ${scopeDescription(context.query.spanScope, context.query.errorsOnly)} · ${summary.count.toLocaleString()} results`}
      context={context}
      onContextChange={setContext}
      onSaveView={(name) => {
        void client.observe.savedViews.create({
          projectId,
          name,
          surface: "traces",
          contextJson: JSON.stringify(context),
        })
      }}
    >
      <ChartFrame
        title="Trace volume"
        description={
          summary.count
            ? `${summary.count.toLocaleString()} traces · ${summary.median.toFixed(0)} ms median · ${summary.errors || errorHist} errors`
            : "Trace count over time"
        }
        hint="Brush to zoom · click a bar to dig in"
        className="mb-3.5"
        state={state === "error" ? "error" : state === "loading" ? "loading" : "idle"}
      >
        <VisualizationCanvas
          kind="bar"
          series={hist}
          height={160}
          valueLabel="Traces"
          onBrush={(_a, _b, from, to) => {
            setContext(digDownTime(context, from.t, to.t))
          }}
          onPointClick={(point) => {
            const half = 2 * 60_000
            setContext(digDownTime(context, point.t - half, point.t + half))
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
        rows={rows}
        emptyTitle="No traces in this window"
        emptyDescription="Widen the time range or clear filters."
        emptyVariant="no_match"
        columns={[
          {
            id: "root",
            header: "Root span",
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
          { id: "svc", header: "Service", cell: (r) => r.service },
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
      {state === "error" ? (
        <ObserveEmptyState
          variant="error"
          className="mt-3"
          action={
            <button
              type="button"
              className="text-sm underline"
              onClick={() => void navigate({ search })}
            >
              Retry
            </button>
          }
        />
      ) : null}
    </ObserveProjectShell>
  )
}
