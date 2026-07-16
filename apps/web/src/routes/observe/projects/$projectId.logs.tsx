import { useEffect, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  AttributeInspector,
  ChartFrame,
  CorrelationLinks,
  DataTable,
  DetailDrawer,
  ObserveOnboarding,
  ObserveProjectShell,
  VisualizationCanvas,
} from "@/components/observe"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import {
  applyColdDefaults,
  contextToApiInput,
  digDownTime,
  parseLogsSearch,
  serializeLogsSearch,
  serializeTraceSearch,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"

export const Route = createFileRoute("/observe/projects/$projectId/logs")({
  validateSearch: (search) => {
    const raw = applyColdDefaults("logs", search as Record<string, unknown>)
    const { context, log } = parseLogsSearch(raw)
    return serializeLogsSearch(context, log)
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
  component: LogsPage,
})

type LogRow = {
  id: string
  timestamp: string
  severity: string
  body: string
  service: string
  trace_id: string
  span_id: string
  attributes: Record<string, string>
}

function LogsPage() {
  const { project } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { context, log: selectedLogId } = parseLogsSearch(search)
  const [rows, setRows] = useState<LogRow[]>([])
  const [hist, setHist] = useState<Array<{ t: number; v: number }>>([])
  const [state, setState] = useState<"loading" | "idle" | "error" | "empty">(
    "loading",
  )
  const [cold, setCold] = useState(false)

  const selected = selectedLogId
    ? (rows.find((r) => r.id === selectedLogId) ?? null)
    : null

  function setContext(next: ObserveContext, logId?: string | null) {
    void navigate({
      search: serializeLogsSearch(
        next,
        logId === undefined ? selectedLogId : logId,
      ),
      replace: true,
    })
  }

  function setSelected(row: LogRow | null) {
    void navigate({
      search: serializeLogsSearch(context, row?.id ?? null),
      replace: true,
    })
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setState("loading")
      try {
        const input = contextToApiInput(projectId, context)
        const [list, histogram, services] = await Promise.all([
          client.observe.logs.search(input),
          client.observe.logs.histogram(input),
          client.observe.services.list(input).catch(() => []),
        ])
        if (cancelled) return
        setRows(
          list.map((r, i) => ({
            id: `${r.timestamp}-${r.trace_id ?? ""}-${i}`,
            timestamp: r.timestamp,
            severity: r.severity,
            body: r.body,
            service: r.service,
            trace_id: r.trace_id,
            span_id: r.span_id,
            attributes: r.attributes ?? {},
          })),
        )
        setHist(histogram.map((h) => ({ t: h.t, v: h.count })))
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

  if (cold && state === "empty") {
    return (
      <ObserveProjectShell
        projectId={projectId}
        title={`Logs · ${project.name}`}
      >
        <ObserveOnboarding projectId={projectId} />
      </ObserveProjectShell>
    )
  }

  return (
    <ObserveProjectShell
      projectId={projectId}
      title={`Logs · ${project.name}`}
      description={`${rows.length.toLocaleString()} results · newest first`}
      context={context}
      onContextChange={(next) => setContext(next)}
      onSaveView={(name) => {
        void client.observe.savedViews.create({
          projectId,
          name,
          surface: "logs",
          contextJson: JSON.stringify(context),
        })
      }}
      actions={
        <Button
          size="sm"
          variant="outline"
          render={
            <Link
              to="/observe/projects/$projectId/alerts"
              params={{ projectId }}
            />
          }
        >
          Create alert
        </Button>
      }
    >
      <ChartFrame
        title="Volume"
        description="Log count over time"
        hint="Brush to zoom · click a bar to dig in"
        className="mb-4"
        state={
          state === "error" ? "error" : state === "loading" ? "loading" : "idle"
        }
      >
        <VisualizationCanvas
          kind="bar"
          series={hist}
          height={180}
          valueLabel="Logs"
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
        onRowClick={setSelected}
        emptyTitle="No logs in this window"
        emptyDescription="Widen the time range or clear filters."
        emptyVariant="no_match"
        columns={[
          {
            id: "ts",
            header: "Time",
            className: "w-40",
            cell: (r) => (
              <span className="font-mono text-xs text-muted-foreground">
                {r.timestamp}
              </span>
            ),
          },
          {
            id: "sev",
            header: "Level",
            className: "w-20",
            cell: (r) => r.severity,
          },
          {
            id: "svc",
            header: "Service",
            className: "w-32",
            cell: (r) => r.service || "—",
          },
          {
            id: "body",
            header: "Message",
            cell: (r) => (
              <span className="line-clamp-2 text-xs">{r.body}</span>
            ),
          },
        ]}
      />

      <DetailDrawer
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        title={selected?.severity ?? "Log"}
        description={selected?.timestamp}
      >
        {selected ? (
          <div className="space-y-4">
            <p className="whitespace-pre-wrap text-sm">{selected.body}</p>
            <CorrelationLinks
              projectId={projectId}
              traceId={selected.trace_id || undefined}
              spanId={selected.span_id || undefined}
              context={context}
            />
            {selected.trace_id ? (
              <Button
                size="sm"
                variant="outline"
                render={
                  <Link
                    to="/observe/projects/$projectId/traces/$traceId"
                    params={{
                      projectId,
                      traceId: selected.trace_id,
                    }}
                    search={serializeTraceSearch(context)}
                  />
                }
              >
                Open trace
              </Button>
            ) : null}
            <AttributeInspector attributes={selected.attributes} />
          </div>
        ) : null}
      </DetailDrawer>
    </ObserveProjectShell>
  )
}
