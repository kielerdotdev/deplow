import { useEffect, useState } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"

import {
  ChartFrame,
  DataTable,
  ObserveEmptyState,
  ObserveOnboarding,
  ObserveProjectShell,
  VisualizationCanvas,
} from "@/components/observe"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import {
  defaultTelemetryQuery,
  serializeTelemetryQuery,
  type TelemetryQuery,
} from "@/lib/observe/telemetry"
import { client } from "@/lib/orpc"

export const Route = createFileRoute("/observe/projects/$projectId/metrics")({
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
  component: MetricsPage,
})

function MetricsPage() {
  const { project } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const [catalog, setCatalog] = useState<
    Array<{
      name: string
      kind: string
      samples: number
      lastSeen: string
    }>
  >([])
  const [selected, setSelected] = useState<string | null>(null)
  const [series, setSeries] = useState<Array<{ t: number; v: number }>>([])
  const [state, setState] = useState<"loading" | "idle" | "error" | "empty">(
    "loading",
  )
  const [temporal, setTemporal] = useState<
    "avg" | "sum" | "min" | "max" | "rate" | "increase"
  >("avg")
  const [spatial, setSpatial] = useState<"avg" | "sum" | "min" | "max">("avg")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setState("loading")
      try {
        const rows = await client.observe.metrics.catalog({ projectId })
        if (cancelled) return
        setCatalog(rows)
        setState(rows.length === 0 ? "empty" : "idle")
        if (rows[0] && !selected) setSelected(rows[0].name)
      } catch {
        if (!cancelled) setState("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    void (async () => {
      try {
        const query: TelemetryQuery = {
          ...defaultTelemetryQuery("metrics"),
          signal: "metrics",
          metric: {
            name: selected,
            temporalAgg: temporal,
            spatialAgg: spatial,
          },
          presentation: { view: "timeseries", sort: "newest" },
        }
        const run = await client.observe.query.run({ projectId, query })
        if (cancelled) return
        if (run.result.kind === "metrics" && run.result.series) {
          const key = run.result.series.seriesMeta[0]?.key ?? "all"
          setSeries(
            run.result.series.points.map((p) => ({
              t: p.t,
              v: Number(p.values[key] ?? 0),
            })),
          )
        } else {
          setSeries([])
        }
      } catch {
        if (!cancelled) setSeries([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, selected, temporal, spatial])

  if (state === "empty") {
    return (
      <ObserveProjectShell
        projectId={projectId}
        title="Metrics"
        description={project.name}
      >
        <ObserveOnboarding projectId={projectId} surface="metrics" />
        <ObserveEmptyState
          variant="empty"
          className="mt-4"
          title="No OTLP metrics yet"
          description="Send OpenTelemetry metrics to this project’s OTLP endpoint."
        />
      </ObserveProjectShell>
    )
  }

  return (
    <ObserveProjectShell
      projectId={projectId}
      title="Metrics"
      description={`${project.name} · temporal then spatial aggregation`}
    >
      <div className="mb-3 flex flex-wrap gap-3">
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Temporal
          <select
            className="block min-h-8 rounded border border-border bg-background px-2 text-xs"
            value={temporal}
            onChange={(e) =>
              setTemporal(e.target.value as typeof temporal)
            }
          >
            <option value="avg">Avg</option>
            <option value="sum">Sum</option>
            <option value="min">Min</option>
            <option value="max">Max</option>
            <option value="rate">Rate</option>
            <option value="increase">Increase</option>
          </select>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Spatial
          <select
            className="block min-h-8 rounded border border-border bg-background px-2 text-xs"
            value={spatial}
            onChange={(e) => setSpatial(e.target.value as typeof spatial)}
          >
            <option value="avg">Avg</option>
            <option value="sum">Sum</option>
            <option value="min">Min</option>
            <option value="max">Max</option>
          </select>
        </label>
        {selected ? (
          <Button
            size="sm"
            variant="outline"
            className="self-end"
            onClick={() => {
              const q: TelemetryQuery = {
                ...defaultTelemetryQuery("metrics"),
                signal: "metrics",
                metric: {
                  name: selected,
                  temporalAgg: temporal,
                  spatialAgg: spatial,
                },
                presentation: { view: "timeseries", sort: "newest" },
              }
              const qs = new URLSearchParams(
                serializeTelemetryQuery(q),
              ).toString()
              window.location.href = `/observe/projects/${projectId}/insights?new=1&${qs}`
            }}
          >
            Create chart
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="md:w-72">
          <DataTable
            state={state === "error" ? "error" : state === "loading" ? "loading" : "idle"}
            rows={catalog.map((r) => ({ id: r.name, ...r }))}
            onRowClick={(r) => setSelected(r.name)}
            emptyTitle="No metrics"
            emptyDescription="Ingest OTLP metrics to populate the catalog."
            emptyVariant="empty"
            columns={[
              {
                id: "name",
                header: "Metric",
                cell: (r) => (
                  <span
                    className={
                      r.name === selected ? "font-medium" : undefined
                    }
                  >
                    {r.name}
                  </span>
                ),
              },
              {
                id: "kind",
                header: "Type",
                cell: (r) => r.kind,
              },
              {
                id: "samples",
                header: "Samples",
                cell: (r) => (
                  <span className="tabular-nums">
                    {r.samples.toLocaleString()}
                  </span>
                ),
              },
            ]}
          />
        </div>
        <div className="min-w-0 flex-1">
          <ChartFrame
            title={selected ?? "Select a metric"}
            description={`${temporal} over time · ${spatial} across series`}
            state={state === "error" ? "error" : "idle"}
          >
            <VisualizationCanvas
              kind="line"
              series={series}
              height={280}
              valueLabel={selected ?? "Value"}
            />
          </ChartFrame>
        </div>
      </div>
    </ObserveProjectShell>
  )
}
