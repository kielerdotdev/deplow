import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"

import { ChartFrame } from "@/components/observe/chart-frame"
import { TrendsChart } from "@/components/observe/trends/trends-chart"
import { Button } from "@/components/ui/button"
import {
  contextToApiInput,
  type ObserveContext,
} from "@/lib/observe/context"
import type { DashboardWidget } from "@/lib/observe/insights"
import {
  migrateInsightToTrends,
  type TrendsQuery,
  type TrendsResult,
} from "@/lib/observe/trends"
import {
  serializeTelemetryQuery,
  trendsToTelemetryQuery,
} from "@/lib/observe/telemetry"
import { client } from "@/lib/orpc"

export function InsightWidget({
  projectId,
  context,
  widget,
  insight,
  groupByOverride,
  onContextChange: _onContextChange,
  actions,
}: {
  projectId: string
  context: ObserveContext
  widget: DashboardWidget
  insight: { id: string; name: string; spec: unknown }
  groupByOverride?: string | null
  onContextChange?: (next: ObserveContext) => void
  actions?: React.ReactNode
}) {
  const query: TrendsQuery = migrateInsightToTrends(insight.spec)
  const [result, setResult] = useState<TrendsResult | null>(null)
  const [state, setState] = useState<"loading" | "idle" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const title = widget.title ?? insight.name

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setState("loading")
      setError(null)
      try {
        const api = contextToApiInput(projectId, context)
        const res = await client.observe.trends.run({
          projectId,
          query: {
            ...query,
            time: {
              kind: "absolute",
              from: new Date(api.from).toISOString(),
              to: new Date(api.to).toISOString(),
            },
          },
          from: api.from,
          to: api.to,
          groupByOverride:
            groupByOverride === undefined ? undefined : groupByOverride,
        })
        if (!cancelled) {
          setResult(res as TrendsResult)
          setState("idle")
        }
      } catch (e) {
        if (!cancelled) {
          setState("error")
          setError(e instanceof Error ? e.message : "Query failed")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    projectId,
    context,
    insight.id,
    groupByOverride,
    // query identity
    JSON.stringify(query),
  ])

  return (
    <ChartFrame
      title={title}
      description={
        groupByOverride
          ? `Grouped by ${groupByOverride}`
          : query.breakdowns[0]
            ? `By ${query.breakdowns[0].field}`
            : query.series[0]
              ? `${query.series[0].measure}`
              : undefined
      }
      state={
        state === "loading" ? "loading" : state === "error" ? "error" : "idle"
      }
      actions={
        <div className="flex items-center gap-1">
          {actions}
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link
                to="/observe/projects/$projectId/traces"
                params={{ projectId }}
                search={serializeTelemetryQuery(trendsToTelemetryQuery(query))}
              />
            }
          >
            Explorer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link
                to="/observe/projects/$projectId/trends"
                params={{ projectId }}
                search={{ insightId: insight.id }}
              />
            }
          >
            Edit
          </Button>
        </div>
      }
      className={widget.colSpan === 2 ? "md:col-span-2" : undefined}
    >
      {error ? <p className="mb-2 text-xs text-destructive">{error}</p> : null}
      {result ? (
        <TrendsChart
          query={query}
          result={result}
          hiddenKeys={new Set()}
          height={180}
        />
      ) : null}
      {state === "idle" && !result ? (
        <p className="text-sm text-muted-foreground">No data</p>
      ) : null}
    </ChartFrame>
  )
}
