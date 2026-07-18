import { useCallback, useMemo, useState } from "react"
import { BellIcon } from "lucide-react"

import {
  BaselinePicker,
  ChartFrame,
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
import {
  defaultTrendsQuery,
  type TrendsQuery,
  type TrendsVizKind,
} from "@/lib/observe/trends"
import { client } from "@/lib/orpc"

export type ChartInsightMeta = {
  id: string
  name: string
  description: string | null
}

export type ChartBuilderProps = {
  projectId: string
  initialQuery?: TrendsQuery
  insightMeta?: ChartInsightMeta | null
  /** Preload alert count badge; defaults to 0. */
  alertCount?: number
  onSaved?: (insight: ChartInsightMeta) => void
  /** Called after a successful save when the user chose Save & close. */
  onSaveAndClose?: (insight: ChartInsightMeta) => void
}

/**
 * Trends query builder used to create / edit saved charts.
 * Owned by the Saved charts surface (dialog), not a standalone page.
 */
export function ChartBuilder({
  projectId,
  initialQuery,
  insightMeta = null,
  alertCount = 0,
  onSaved,
  onSaveAndClose,
}: ChartBuilderProps) {
  const [query, setQuery] = useState<TrendsQuery>(
    () => initialQuery ?? defaultTrendsQuery(),
  )
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())
  const [saveName, setSaveName] = useState(insightMeta?.name ?? "")
  const [activeInsight, setActiveInsight] = useState(insightMeta)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [showAlert, setShowAlert] = useState(false)

  const { result, error, loading, refresh } = useTrendsQuery(projectId, query)

  const patch = useCallback((partial: Partial<TrendsQuery>) => {
    setQuery((prev) => ({ ...prev, ...partial }))
  }, [])

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

  async function saveInsight(closeAfter = false) {
    const name = saveName.trim() || "Untitled chart"
    setSaving(true)
    try {
      let next: ChartInsightMeta
      if (activeInsight) {
        await client.observe.insights.update({
          projectId,
          insightId: activeInsight.id,
          name,
          spec: query,
        })
        next = { ...activeInsight, name }
      } else {
        const { id } = await client.observe.insights.create({
          projectId,
          name,
          spec: query,
        })
        next = { id, name, description: null }
      }
      setActiveInsight(next)
      setJustSaved(true)
      window.setTimeout(() => setJustSaved(false), 1600)
      onSaved?.(next)
      if (closeAfter) onSaveAndClose?.(next)
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
    setQuery(next)
  }

  return (
    <div className="flex flex-col gap-3" data-testid="chart-builder">
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
            aria-label="Chart name"
          />
          {justSaved ? (
            <span className="text-xs font-medium text-success tabular-nums">
              Saved
            </span>
          ) : null}
          <Button
            size="sm"
            disabled={saving}
            onClick={() => void saveInsight(false)}
          >
            {saving ? "Saving…" : activeInsight ? "Update" : "Save"}
          </Button>
          {onSaveAndClose ? (
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void saveInsight(true)}
            >
              Save & close
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setShowAlert((v) => !v)}
          >
            <BellIcon className="size-3.5" />
            Alert
            {alertCount > 0 ? (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                ({alertCount})
              </span>
            ) : null}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery(defaultTrendsQuery())
              setSaveName("")
              setActiveInsight(null)
              setJustSaved(false)
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <CreateAlertFromTrends
        projectId={projectId}
        query={query}
        open={showAlert}
        onOpenChange={setShowAlert}
        onCreated={() => setShowAlert(false)}
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
            title={saveName.trim() || "Chart preview"}
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
                height={280}
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
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
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
