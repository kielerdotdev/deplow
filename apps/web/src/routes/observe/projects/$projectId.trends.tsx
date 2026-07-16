import { useCallback, useMemo, useState } from "react"
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { BellIcon } from "lucide-react"

import {
  BaselinePicker,
  ChartFrame,
  ObserveProjectShell,
  TimeRangePicker,
} from "@/components/observe"
import { AnalysisTypeTabs } from "@/components/observe/trends/analysis-type-tabs"
import { BreakdownBuilder } from "@/components/observe/trends/breakdown-builder"
import { CreateAlertFromTrends } from "@/components/observe/trends/create-alert-dialog"
import { ExportMenu } from "@/components/observe/trends/export-menu"
import { FormulaEditor } from "@/components/observe/trends/formula-editor"
import { TrendsFilterBuilder } from "@/components/observe/trends/filter-builder"
import { IntervalPicker } from "@/components/observe/trends/interval-picker"
import { ResultTable } from "@/components/observe/trends/result-table"
import { SeriesBuilder } from "@/components/observe/trends/series-builder"
import { TrendsChart } from "@/components/observe/trends/trends-chart"
import { useTrendsQuery } from "@/components/observe/trends/use-trends-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getSession } from "@/lib/auth.functions"
import {
  defaultTrendsQuery,
  parseTrendsQuery,
  serializeTrendsQuery,
  trendsQuerySchema,
  type TrendsQuery,
  type TrendsVizKind,
} from "@/lib/observe/trends"
import { client } from "@/lib/orpc"

type ChartsSearch = {
  tq?: string
  insightId?: string
}

export const Route = createFileRoute("/observe/projects/$projectId/trends")({
  validateSearch: (search): ChartsSearch => {
    const raw = search as Record<string, unknown>
    const q = parseTrendsQuery(raw)
    const insightId =
      typeof raw.insightId === "string" ? raw.insightId : undefined
    return {
      ...serializeTrendsQuery(q),
      ...(insightId ? { insightId } : {}),
    }
  },
  beforeLoad: ({ params, search }) => {
    const raw = search as Record<string, unknown>
    const view = typeof raw.view === "string" ? raw.view : undefined
    if (view === "library") {
      throw redirect({
        to: "/observe/projects/$projectId/insights",
        params: { projectId: params.projectId },
      })
    }
    if (view === "boards") {
      const dashboardId =
        typeof raw.dashboardId === "string" ? raw.dashboardId : undefined
      if (dashboardId) {
        throw redirect({
          to: "/observe/projects/$projectId/dashboards/$dashboardId",
          params: { projectId: params.projectId, dashboardId },
        })
      }
      throw redirect({
        to: "/observe/projects/$projectId/dashboards",
        params: { projectId: params.projectId },
      })
    }
  },
  loader: async ({ params, location }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    await client.observe.projects.enable({ projectId: params.projectId }).catch(
      () => null,
    )
    const project = await client.projects.get({ id: params.projectId })
    const search = location.search as ChartsSearch

    let initialQuery = parseTrendsQuery(search)
    let insightMeta: {
      id: string
      name: string
      description: string | null
    } | null = null
    if (search.insightId) {
      const insight = await client.observe.insights
        .get({ projectId: params.projectId, insightId: search.insightId })
        .catch(() => null)
      if (insight) {
        initialQuery = trendsQuerySchema.parse(insight.spec)
        insightMeta = {
          id: insight.id,
          name: insight.name,
          description: insight.description,
        }
      }
    }

    const alerts = await client.observe.alerts
      .list({ projectId: params.projectId })
      .catch(() => [])

    return { project, initialQuery, insightMeta, alerts }
  },
  component: ChartsPage,
})

function ChartsPage() {
  const data = Route.useLoaderData()
  const { projectId } = Route.useParams()

  return (
    <ObserveProjectShell
      projectId={projectId}
      title="Charts"
      description={`Build Trends queries for ${data.project.name}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            render={
              <Link
                to="/observe/projects/$projectId/insights"
                params={{ projectId }}
              />
            }
          >
            Saved charts
          </Button>
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
            Alerts
          </Button>
        </div>
      }
    >
      <BuilderView />
    </ObserveProjectShell>
  )
}

function BuilderView() {
  const { initialQuery, insightMeta, alerts } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const navigate = Route.useNavigate()
  const router = useRouter()

  const [query, setQuery] = useState<TrendsQuery>(initialQuery)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())
  const [saveName, setSaveName] = useState(insightMeta?.name ?? "")
  const [saving, setSaving] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [showAlert, setShowAlert] = useState(false)

  const { result, error, loading, refresh } = useTrendsQuery(projectId, query)

  const syncUrl = useCallback(
    (next: TrendsQuery) => {
      setQuery(next)
      void navigate({
        search: {
          ...serializeTrendsQuery(next),
          ...(insightMeta ? { insightId: insightMeta.id } : {}),
        },
        replace: true,
      })
    },
    [navigate, insightMeta],
  )

  const patch = useCallback(
    (partial: Partial<TrendsQuery>) => {
      syncUrl({ ...query, ...partial })
    },
    [query, syncUrl],
  )

  function digToAbsolute(fromMs: number, toMs: number) {
    patch({
      time: {
        kind: "absolute",
        from: new Date(Math.min(fromMs, toMs)).toISOString(),
        to: new Date(Math.max(fromMs, toMs)).toISOString(),
      },
    })
  }

  const vizKinds: { id: TrendsVizKind; label: string }[] = useMemo(
    () => [
      { id: "line", label: "Line" },
      { id: "area", label: "Area" },
      { id: "bar", label: "Bar" },
      { id: "stacked_bar", label: "Stacked bar" },
      { id: "number", label: "Number" },
      { id: "table", label: "Table" },
      { id: "histogram", label: "Histogram" },
    ],
    [],
  )

  async function saveInsight() {
    const name = saveName.trim() || "Untitled chart"
    setSaving(true)
    try {
      if (insightMeta) {
        await client.observe.insights.update({
          projectId,
          insightId: insightMeta.id,
          name,
          spec: query,
        })
      } else {
        const { id } = await client.observe.insights.create({
          projectId,
          name,
          spec: query,
        })
        void navigate({
          search: {
            ...serializeTrendsQuery(query),
            insightId: id,
          },
          replace: true,
        })
      }
      await router.invalidate()
    } finally {
      setSaving(false)
    }
  }

  function onAnalysisChange(analysis: TrendsQuery["analysis"]) {
    const next: TrendsQuery = { ...query, analysis }
    if (analysis === "compare" && query.baseline.mode === "none") {
      next.baseline = { mode: "previous" }
    }
    if (analysis === "distributions") {
      next.viz = { ...next.viz, kind: "histogram" }
    } else if (query.viz.kind === "histogram" && analysis === "trends") {
      next.viz = { ...next.viz, kind: "line" }
    }
    syncUrl(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AnalysisTypeTabs
          projectId={projectId}
          analysis={query.analysis}
          onAnalysisChange={onAnalysisChange}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Chart name"
            className="h-8 w-40 text-xs"
          />
          <Button
            size="sm"
            disabled={saving}
            onClick={() => void saveInsight()}
          >
            {insightMeta ? "Update" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setShowAlert((v) => !v)}
          >
            <BellIcon className="size-3.5" />
            Alert
            {alerts.length > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                ({alerts.length})
              </span>
            ) : null}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              syncUrl(defaultTrendsQuery())
              setSaveName("")
            }}
          >
            New
          </Button>
        </div>
      </div>

      <CreateAlertFromTrends
        projectId={projectId}
        query={query}
        open={showAlert}
        onOpenChange={setShowAlert}
        onCreated={() => {
          void router.invalidate()
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-4 surface-panel p-3">
          <SeriesBuilder
            series={query.series}
            onChange={(series) => patch({ series })}
          />
          <FormulaEditor
            formulas={query.formulas}
            series={query.series}
            onChange={(formulas) => patch({ formulas })}
          />
          <TrendsFilterBuilder
            projectId={projectId}
            filters={query.filters}
            onChange={(filters) => patch({ filters })}
          />
          <BreakdownBuilder
            projectId={projectId}
            breakdowns={query.breakdowns}
            onChange={(breakdowns) => patch({ breakdowns })}
          />

          <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Time
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <TimeRangePicker
                value={query.time}
                onChange={(time) => patch({ time })}
              />
              <IntervalPicker
                value={query.interval}
                onChange={(interval) => patch({ interval })}
              />
            </div>
            <BaselinePicker
              value={query.baseline}
              onChange={(baseline) => patch({ baseline })}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={query.excludeInternal === true}
                onChange={(e) =>
                  patch({ excludeInternal: e.target.checked || undefined })
                }
              />
              Exclude health / synthetic
            </label>
          </div>

          <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowOptions((o) => !o)}
            >
              {showOptions ? "Hide" : "Show"} chart options
            </button>
            {showOptions ? (
              <select
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                value={query.viz.kind}
                onChange={(e) =>
                  patch({
                    viz: {
                      ...query.viz,
                      kind: e.target.value as TrendsVizKind,
                    },
                  })
                }
              >
                {vizKinds.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </aside>

        <div className="flex flex-col gap-4">
          <ChartFrame
            title={saveName.trim() || "Trends"}
            description={
              result
                ? `Interval ${result.intervalSec}s · ${result.points.length} buckets`
                : undefined
            }
            state={loading ? "loading" : error ? "error" : "idle"}
            hint={
              result?.warnings?.length
                ? result.warnings.join(" · ")
                : (error ??
                  "Drag the brush to zoom · click a point to dig into that bucket")
            }
            actions={
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={refresh}>
                  Refresh
                </Button>
                <ExportMenu projectId={projectId} query={query} />
              </div>
            }
          >
            {result ? (
              <TrendsChart
                query={query}
                result={result}
                hiddenKeys={hiddenKeys}
                height={300}
                onBrushRange={digToAbsolute}
                onPointClick={(t) => {
                  const half = Math.max(
                    (result.intervalSec || 60) * 1000,
                    30_000,
                  )
                  digToAbsolute(t - half, t + half)
                }}
              />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                {loading ? "Running…" : "No data"}
              </div>
            )}
          </ChartFrame>

          <ChartFrame title="Results" description="Exact values per bucket">
            {result ? (
              <ResultTable
                result={result}
                hiddenKeys={hiddenKeys}
                onToggleKey={(key) => {
                  setHiddenKeys((prev) => {
                    const next = new Set(prev)
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Waiting…</p>
            )}
          </ChartFrame>

          {query.time.kind === "absolute" ? (
            <p className="text-xs text-muted-foreground">
              Dig-down active ·{" "}
              <button
                type="button"
                className="underline"
                onClick={() =>
                  patch({ time: { kind: "preset", preset: "1h" } })
                }
              >
                Reset to last 1h
              </button>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
