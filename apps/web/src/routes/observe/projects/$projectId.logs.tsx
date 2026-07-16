import { useEffect, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  AttributeInspector,
  ChartFrame,
  DataTable,
  DetailDrawer,
  ObserveProjectShell,
  VisualizationCanvas,
} from "@/components/observe"
import { getSession } from "@/lib/auth.functions"
import {
  contextToApiInput,
  digDownTime,
  parseContext,
  serializeContext,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/observe/projects/$projectId/logs")({
  validateSearch: (search) => serializeContext(parseContext(search)),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const shell = await loadShellContext()
    const status = await client.observe.status().catch(() => null)
    const project = await client.projects.get({ id: params.projectId })
    return { session, shell, status, project }
  },
  component: LogsPage,
})

function LogsPage() {
  const { session, shell, status, project } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const context = parseContext(search)
  const [rows, setRows] = useState<
    Array<{
      id: string
      timestamp: string
      severity: string
      body: string
      service: string
      trace_id: string
      span_id: string
      attributes: Record<string, string>
    }>
  >([])
  const [hist, setHist] = useState<Array<{ t: number; v: number }>>([])
  const [selected, setSelected] = useState<(typeof rows)[number] | null>(null)
  const [state, setState] = useState<"loading" | "idle" | "error">("loading")

  function setContext(next: ObserveContext) {
    void navigate({ search: serializeContext(next), replace: true })
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setState("loading")
      try {
        const input = {
          ...contextToApiInput(projectId, context),
          traceId: context.query.traceId,
          spanId: context.query.spanId,
          limit: 200,
        }
        const [logs, histogram] = await Promise.all([
          client.observe.logs.search(input),
          client.observe.logs.histogram(input),
        ])
        if (cancelled) return
        setRows(
          logs.map((l, i) => ({
            id: `${l.timestamp}-${i}`,
            ...l,
          })),
        )
        setHist(histogram.map((h) => ({ t: h.t, v: h.count })))
        setState("idle")
      } catch {
        if (!cancelled) setState("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, search])

  return (
    <ObserveProjectShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      observeEnabled={status?.enabled === true}
      projectId={projectId}
      title={`Logs · ${project.name}`}
      description="Histogram + table. Open traces from correlated IDs."
      context={context}
      onContextChange={setContext}
    >
      <ChartFrame
        title="Volume"
        description="Log count over time"
        hint="Use the brush below to zoom · click a bar to dig in"
        className="mb-4"
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
      <div className="surface-panel overflow-hidden">
        <div className="border-b border-border/60 px-5 py-3.5">
          <h3 className="text-sm font-semibold tracking-tight">Log events</h3>
        </div>
        <DataTable
          state={state}
          rows={rows}
          onRowClick={setSelected}
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
              cell: (r) => r.severity || "—",
            },
            {
              id: "svc",
              header: "Service",
              className: "w-28",
              cell: (r) => r.service,
            },
            {
              id: "body",
              header: "Message",
              cell: (r) => <span className="line-clamp-2">{r.body}</span>,
            },
            {
              id: "trace",
              header: "Trace",
              className: "w-28",
              cell: (r) =>
                r.trace_id ? (
                  <Link
                    to="/observe/projects/$projectId/traces/$traceId"
                    params={{ projectId, traceId: r.trace_id }}
                    search={serializeContext(context)}
                    className="font-mono text-xs hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.trace_id.slice(0, 8)}…
                  </Link>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </div>
      <DetailDrawer
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        title="Log event"
        description={selected?.timestamp}
      >
        {selected ? (
          <div className="space-y-5">
            <pre className="surface-inset whitespace-pre-wrap px-3 py-3 text-xs leading-relaxed">
              {selected.body}
            </pre>
            <AttributeInspector attributes={selected.attributes} />
            {selected.trace_id ? (
              <Link
                to="/observe/projects/$projectId/traces/$traceId"
                params={{ projectId, traceId: selected.trace_id }}
                search={serializeContext(context)}
                className="inline-flex text-sm font-medium underline-offset-4 hover:underline"
              >
                Open trace
              </Link>
            ) : null}
          </div>
        ) : null}
      </DetailDrawer>
    </ObserveProjectShell>
  )
}
