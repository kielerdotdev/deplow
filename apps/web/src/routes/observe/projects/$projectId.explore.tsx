import { useEffect, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  ChartFrame,
  DataTable,
  ObserveEmptyState,
  ObserveProjectShell,
  ObserveStatusBadge,
  SelectionBrush,
  VisualizationCanvas,
} from "@/components/observe"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSession } from "@/lib/auth.functions"
import {
  contextToApiInput,
  digDownHeatCell,
  parseContext,
  selectionApiInput,
  serializeContext,
  serializeTraceSearch,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"

export const Route = createFileRoute("/observe/projects/$projectId/explore")({
  validateSearch: (search) => serializeContext(parseContext(search)),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const project = await client.projects.get({ id: params.projectId })
    return { project }
  },
  component: ExplorePage,
})

function ExplorePage() {
  const { project } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const context = parseContext(search)
  const tab = context.tab ?? "anomalies"

  const [heat, setHeat] = useState<Array<{ x: number; y: number; v: number }>>(
    [],
  )
  const [counts, setCounts] = useState<{
    selected: number
    baseline: number | null
  } | null>(null)
  const [anomalies, setAnomalies] = useState<
    Array<{
      id: string
      key: string
      value: string
      lift: number
      selected_share: number
      baseline_share: number
    }>
  >([])
  const [sampled, setSampled] = useState(false)
  const [traces, setTraces] = useState<
    Array<{
      id: string
      trace_id: string
      root_name: string
      duration_ms: number
      service: string
    }>
  >([])
  const [logs, setLogs] = useState<
    Array<{ id: string; body: string; severity: string; trace_id: string }>
  >([])

  function setContext(next: ObserveContext) {
    void navigate({ search: serializeContext(next), replace: true })
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const input = contextToApiInput(projectId, context)
      const heatmap = await client.observe.explore.heatmap(input).catch(() => [])
      if (cancelled) return
      setHeat(heatmap)

      const sel = selectionApiInput(projectId, context)
      if (sel) {
        const [c, a] = await Promise.all([
          client.observe.explore.selection({
            selected: sel.selected,
            baseline: sel.baseline ?? undefined,
          }),
          sel.baseline
            ? client.observe.explore.anomalies({
                selected: sel.selected,
                baseline: sel.baseline,
              })
            : Promise.resolve({ anomalies: [], sampled: false }),
        ])
        if (cancelled) return
        setCounts(c)
        setSampled(a.sampled)
        setAnomalies(
          a.anomalies.map((x, i) => ({
            id: `${x.key}-${x.value}-${i}`,
            ...x,
          })),
        )
        const [t, l] = await Promise.all([
          client.observe.traces.list({ ...sel.selected, limit: 30 }),
          client.observe.logs.search({ ...sel.selected, limit: 30 }),
        ])
        if (cancelled) return
        setTraces(
          t.map((tr) => ({
            id: tr.trace_id,
            trace_id: tr.trace_id,
            root_name: tr.root_name,
            duration_ms: tr.duration_ms,
            service: tr.service,
          })),
        )
        setLogs(
          l.map((row, i) => ({
            id: `${row.timestamp}-${i}`,
            body: row.body,
            severity: row.severity,
            trace_id: row.trace_id,
          })),
        )
      } else {
        setCounts(null)
        setAnomalies([])
        setTraces([])
        setLogs([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, search])

  function applyBrush() {
    // Demo brush: middle 40% of current time window, slow duration band
    const input = contextToApiInput(projectId, context)
    const from = new Date(input.from).getTime()
    const to = new Date(input.to).getTime()
    const span = to - from
    setContext({
      ...context,
      selection: {
        timeFrom: new Date(from + span * 0.3).toISOString(),
        timeTo: new Date(from + span * 0.7).toISOString(),
        yMin: 200,
        yMax: 5000,
        yAxis: "duration_ms",
      },
      tab: "anomalies",
      baseline:
        context.baseline.mode === "none"
          ? { mode: "previous" }
          : context.baseline,
    })
  }

  async function saveView(name: string) {
    await client.observe.savedViews.create({
      projectId,
      name,
      surface: "explore",
      contextJson: JSON.stringify(context),
    })
  }

  return (
    <ObserveProjectShell
      projectId={projectId}
      title={`Explore · ${project.name}`}
      description="Heatmap → selection → attributes associated with the cohort → evidence."
      context={context}
      onContextChange={setContext}
      onSaveView={(name) => void saveView(name)}
    >
      <ChartFrame
        title="Latency heatmap"
        description="Time × duration. Click a hot cell to dig into that cohort."
        hint="Click a cell · or use Select slow region"
        actions={
          <Button size="sm" variant="outline" onClick={applyBrush}>
            Select slow region
          </Button>
        }
        className="mb-3"
      >
        <VisualizationCanvas
          kind="heatmap"
          heat={heat}
          height={200}
          onHeatCellClick={(cell) => {
            setContext(digDownHeatCell(context, cell))
          }}
        />
      </ChartFrame>

      <SelectionBrush
        selection={context.selection}
        selectedCount={counts?.selected}
        baselineCount={counts?.baseline ?? undefined}
        onClear={() =>
          setContext({ ...context, selection: undefined })
        }
      />

      {!context.selection ? (
        <ObserveEmptyState
          className="mt-4"
          title="No selection"
          description="Select a rectangular region on the heatmap (or use Select slow region) to compare against baseline."
        />
      ) : (
        <div className="mt-4">
          {sampled ? (
            <div className="mb-2">
              <ObserveStatusBadge state="sampled" />
            </div>
          ) : null}
          <Tabs
            value={tab}
            onValueChange={(v) =>
              setContext({
                ...context,
                tab: v as ObserveContext["tab"],
              })
            }
          >
            <TabsList>
              <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
              <TabsTrigger value="traces">Traces</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="root_spans">Root spans</TabsTrigger>
              <TabsTrigger value="database">Database</TabsTrigger>
              <TabsTrigger value="external">External</TabsTrigger>
            </TabsList>
            <TabsContent value="anomalies" className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Attributes associated with the selection (not root cause).
              </p>
              <div className="surface-panel overflow-hidden">
                <DataTable
                  rows={anomalies}
                  columns={[
                    {
                      id: "attr",
                      header: "Attribute",
                      cell: (r) => (
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() =>
                            setContext({
                              ...context,
                              filters: [
                                ...context.filters,
                                { key: r.key, op: "eq", value: r.value },
                              ],
                            })
                          }
                        >
                          <span className="font-mono text-xs">
                            {r.key}={r.value}
                          </span>
                        </button>
                      ),
                    },
                    {
                      id: "lift",
                      header: "Lift",
                      cell: (r) => `${r.lift.toFixed(1)}×`,
                    },
                    {
                      id: "share",
                      header: "Selected share",
                      cell: (r) => `${(r.selected_share * 100).toFixed(1)}%`,
                    },
                    {
                      id: "base",
                      header: "Baseline share",
                      cell: (r) => `${(r.baseline_share * 100).toFixed(1)}%`,
                    },
                  ]}
                  emptyTitle="No anomalies"
                  emptyDescription="Set a previous-period baseline and select a cohort with enough spans."
                />
              </div>
            </TabsContent>
            <TabsContent value="traces" className="mt-3">
              <div className="surface-panel overflow-hidden">
                <DataTable
                  rows={traces}
                  columns={[
                    {
                      id: "root",
                      header: "Root",
                      cell: (r) => (
                        <Link
                          to="/observe/projects/$projectId/traces/$traceId"
                          params={{ projectId, traceId: r.trace_id }}
                          search={serializeTraceSearch(context)}
                          className="hover:underline"
                        >
                          {r.root_name}
                        </Link>
                      ),
                    },
                    { id: "svc", header: "Service", cell: (r) => r.service },
                    {
                      id: "dur",
                      header: "Duration",
                      cell: (r) => `${r.duration_ms.toFixed(0)}ms`,
                    },
                  ]}
                />
              </div>
            </TabsContent>
            <TabsContent value="logs" className="mt-3">
              <div className="surface-panel overflow-hidden">
                <DataTable
                  rows={logs}
                  columns={[
                    { id: "sev", header: "Level", cell: (r) => r.severity },
                    {
                      id: "body",
                      header: "Message",
                      cell: (r) => (
                        <span className="line-clamp-2 text-xs">{r.body}</span>
                      ),
                    },
                    {
                      id: "trace",
                      header: "Trace",
                      cell: (r) =>
                        r.trace_id ? (
                          <Link
                            to="/observe/projects/$projectId/traces/$traceId"
                            params={{ projectId, traceId: r.trace_id }}
                            search={serializeTraceSearch(context)}
                            className="font-mono text-xs hover:underline"
                          >
                            open
                          </Link>
                        ) : (
                          "—"
                        ),
                    },
                  ]}
                />
              </div>
            </TabsContent>
            <TabsContent value="root_spans" className="mt-3">
              <div className="surface-panel overflow-hidden">
                <DataTable
                  rows={traces}
                  columns={[
                    {
                      id: "root",
                      header: "Root span",
                      cell: (r) => r.root_name,
                    },
                    {
                      id: "dur",
                      header: "Duration",
                      cell: (r) => `${r.duration_ms.toFixed(0)}ms`,
                    },
                  ]}
                />
              </div>
            </TabsContent>
            <TabsContent value="database" className="mt-3">
              <ObserveEmptyState
                title="Database spans"
                description="Filter cohort by db.system when present on selected spans."
              />
            </TabsContent>
            <TabsContent value="external" className="mt-3">
              <ObserveEmptyState
                title="External calls"
                description="Filter cohort by net.peer.name / http.host when present."
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </ObserveProjectShell>
  )
}
