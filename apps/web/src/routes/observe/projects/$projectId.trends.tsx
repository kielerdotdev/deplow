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
  InsightWidget,
  ObserveEmptyState,
  ObserveProjectShell,
  TimeRangePicker,
} from "@/components/observe"
import { AnalysisTypeTabs } from "@/components/observe/trends/analysis-type-tabs"
import { BreakdownBuilder } from "@/components/observe/trends/breakdown-builder"
import {
  ChartsHubTabs,
  type ChartsView,
} from "@/components/observe/trends/charts-hub-tabs"
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
  parseContext,
  type ObserveContext,
} from "@/lib/observe/context"
import {
  parseDashboardLayout,
  type DashboardLayout,
} from "@/lib/observe/insights"
import {
  defaultTrendsQuery,
  parseTrendsQuery,
  serializeTrendsQuery,
  trendsQuerySchema,
  type TrendsQuery,
  type TrendsVizKind,
} from "@/lib/observe/trends"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

type ChartsSearch = {
  tq?: string
  view: ChartsView
  insightId?: string
  dashboardId?: string
}

export const Route = createFileRoute("/observe/projects/$projectId/trends")({
  validateSearch: (search): ChartsSearch => {
    const raw = search as Record<string, unknown>
    const q = parseTrendsQuery(raw)
    const insightId =
      typeof raw.insightId === "string" ? raw.insightId : undefined
    const dashboardId =
      typeof raw.dashboardId === "string" ? raw.dashboardId : undefined
    const viewRaw = typeof raw.view === "string" ? raw.view : "builder"
    const view: ChartsView =
      viewRaw === "library" || viewRaw === "boards" ? viewRaw : "builder"
    return {
      ...serializeTrendsQuery(q),
      view,
      ...(insightId ? { insightId } : {}),
      ...(dashboardId ? { dashboardId } : {}),
    }
  },
  loader: async ({ params, location }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const shell = await loadShellContext()
    const status = await client.observe.status().catch(() => null)
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

    const [insights, dashboards, alerts] = await Promise.all([
      client.observe.insights
        .list({ projectId: params.projectId })
        .catch(() => []),
      client.observe.dashboards
        .list({ projectId: params.projectId })
        .catch(() => []),
      client.observe.alerts
        .list({ projectId: params.projectId })
        .catch(() => []),
    ])

    let board: Awaited<
      ReturnType<typeof client.observe.dashboards.get>
    > | null = null
    if (search.dashboardId) {
      board = await client.observe.dashboards
        .get({
          projectId: params.projectId,
          dashboardId: search.dashboardId,
        })
        .catch(() => null)
    }

    return {
      session,
      shell,
      status,
      project,
      initialQuery,
      insightMeta,
      insights,
      dashboards,
      alerts,
      board,
    }
  },
  component: ChartsHubPage,
})

function ChartsHubPage() {
  const data = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const view = search.view || "builder"

  return (
    <ObserveProjectShell
      user={data.session.user}
      instanceAdmin={data.shell.instanceAdmin}
      organizations={data.shell.organizations}
      activeOrganization={data.shell.activeOrganization}
      observeEnabled={data.status?.enabled === true}
      projectId={projectId}
      title={`Charts · ${data.project.name}`}
      description="Build, save, and board Trends queries — alerts from the builder."
    >
      <ChartsHubTabs
        projectId={projectId}
        view={view}
        search={{
          tq: search.tq,
          insightId: search.insightId,
          dashboardId: search.dashboardId,
        }}
      />
      {view === "builder" ? <BuilderView /> : null}
      {view === "library" ? <LibraryView /> : null}
      {view === "boards" ? <BoardsView /> : null}
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
          view: "builder",
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
            view: "builder",
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
    <div className="space-y-3">
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

      {showAlert ? (
        <CreateAlertFromTrends
          projectId={projectId}
          query={query}
          onCancel={() => setShowAlert(false)}
          onCreated={async () => {
            setShowAlert(false)
            await router.invalidate()
          }}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4 surface-panel p-3">
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

          <div className="space-y-2 border-t border-border/60 pt-3">
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

          <div className="space-y-2 border-t border-border/60 pt-3">
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

        <div className="space-y-4">
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

function LibraryView() {
  const { insights } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const router = useRouter()

  if (insights.length === 0) {
    return (
      <ObserveEmptyState
        title="No saved charts"
        description="Build a Trends query and hit Save — it shows up here."
        action={
          <Button
            size="sm"
            render={
              <Link
                to="/observe/projects/$projectId/trends"
                params={{ projectId }}
                search={{ view: "builder" }}
              />
            }
          >
            Open builder
          </Button>
        }
      />
    )
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {insights.map((i) => {
        const spec = i.spec as TrendsQuery
        const label =
          spec.series?.[0]?.label ?? spec.series?.[0]?.measure ?? "chart"
        return (
          <li key={i.id} className="surface-panel flex flex-col gap-2 p-4">
            <div>
              <h3 className="truncate text-sm font-semibold">{i.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {spec.series?.length ?? 0} series · {label}
              </p>
            </div>
            <div className="mt-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                render={
                  <Link
                    to="/observe/projects/$projectId/trends"
                    params={{ projectId }}
                    search={{ view: "builder", insightId: i.id }}
                  />
                }
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  await client.observe.insights.delete({
                    projectId,
                    insightId: i.id,
                  })
                  await router.invalidate()
                }}
              >
                Delete
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function BoardsView() {
  const { dashboards, board, insights } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const search = Route.useSearch()
  const [context, setContext] = useState<ObserveContext>(() =>
    parseContext({}),
  )
  const [creating, setCreating] = useState(false)

  if (board) {
    const layout: DashboardLayout =
      board.layout &&
      typeof board.layout === "object" &&
      Array.isArray((board.layout as DashboardLayout).widgets)
        ? (board.layout as DashboardLayout)
        : parseDashboardLayout(
            typeof board.layoutJson === "string"
              ? board.layoutJson
              : JSON.stringify(board.layoutJson ?? { widgets: [] }),
          )
    const widgets = Array.isArray(layout.widgets) ? layout.widgets : []
    const insightMap = new Map(
      [...(board.insights ?? []), ...insights].map((i) => [i.id, i]),
    )

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void navigate({
                search: {
                  view: "boards",
                  tq: search.tq,
                  insightId: search.insightId,
                },
              })
            }
          >
            ← All boards
          </Button>
          <h2 className="text-sm font-semibold">{board.name}</h2>
          <div className="ml-auto">
            <TimeRangePicker
              value={context.time}
              onChange={(time) => setContext({ ...context, time })}
            />
          </div>
        </div>
        {widgets.length === 0 ? (
          <ObserveEmptyState
            title="Empty board"
            description="Add widgets from Saved charts (library)."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {widgets.map((w) => {
              const insight = insightMap.get(w.insightId)
              if (!insight) return null
              return (
                <InsightWidget
                  key={w.id}
                  projectId={projectId}
                  context={context}
                  widget={w}
                  insight={insight}
                  onContextChange={setContext}
                />
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={creating}
          onClick={async () => {
            setCreating(true)
            try {
              const { id } = await client.observe.dashboards.create({
                projectId,
                name: "Untitled board",
                template: "blank",
              })
              await router.invalidate()
              void navigate({
                search: { view: "boards", dashboardId: id, tq: search.tq },
              })
            } finally {
              setCreating(false)
            }
          }}
        >
          New board
        </Button>
      </div>
      {dashboards.length === 0 ? (
        <ObserveEmptyState
          title="No boards yet"
          description="Boards are grids of saved charts with a shared time range."
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {dashboards.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="surface-panel w-full p-4 text-left hover:bg-muted/30"
                onClick={() =>
                  void navigate({
                    search: {
                      view: "boards",
                      dashboardId: d.id,
                      tq: search.tq,
                    },
                  })
                }
              >
                <h3 className="text-sm font-semibold">{d.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {d.template}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
