import { useEffect, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  ChartFrame,
  DataTable,
  FirstSignalCelebration,
  ObserveEmptyState,
  ObserveOnboarding,
  ObserveProjectShell,
  SetupChecklist,
  StatStrip,
  VisualizationCanvas,
} from "@/components/observe"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import { cn } from "@/lib/utils"
import {
  applyColdDefaults,
  contextToApiInput,
  digDownTime,
  parseContext,
  serializeContext,
  type ObserveContext,
} from "@/lib/observe/context"
import { formatPercent, formatRate, formatRelative } from "@/lib/observe/format"
import { client } from "@/lib/orpc"

type AlertRow = Awaited<
  ReturnType<typeof client.observe.alerts.list>
>[number]

export const Route = createFileRoute("/observe/projects/$projectId/")({
  validateSearch: (search) =>
    serializeContext(
      parseContext(
        applyColdDefaults("overview", search as Record<string, unknown>),
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
  component: OverviewPage,
})

function OverviewPage() {
  const { project } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const context = parseContext(search)
  const [overview, setOverview] = useState<Awaited<
    ReturnType<typeof client.observe.services.overview>
  > | null>(null)
  const [rate, setRate] = useState<Array<{ t: number; v: number }>>([])
  const [services, setServices] = useState<
    Array<{
      id: string
      service: string
      request_rate: number
      error_rate: number
      duration_p95_ms: number
      span_count: number
    }>
  >([])
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [state, setState] = useState<"loading" | "idle" | "empty" | "error">(
    "loading",
  )

  function setContext(next: ObserveContext) {
    void navigate({ search: serializeContext(next), replace: true })
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setState("loading")
      try {
        const input = contextToApiInput(projectId, context)
        const [ov, series, list, issues, alertRows] = await Promise.all([
          client.observe.services.overview(input),
          client.observe.charts.series({ ...input, metric: "rate" }),
          client.observe.services.list(input),
          client.observe.issues
            .list({ projectId, status: "unresolved" })
            .catch(() => []),
          client.observe.alerts
            .list({ projectId })
            .catch(() => [] as AlertRow[]),
        ])
        if (cancelled) return
        setOverview(ov)
        setRate(series)
        setAlerts(alertRows)
        setServices(
          list.map((s) => ({
            id: s.service,
            service: s.service,
            request_rate: s.request_rate,
            error_rate: s.error_rate,
            duration_p95_ms: s.duration_p95_ms,
            span_count: s.span_count,
          })),
        )
        setState(
          list.length === 0 && issues.length === 0 ? "empty" : "idle",
        )
      } catch {
        if (!cancelled) setState("error")
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [projectId, search])

  return (
    <ObserveProjectShell
      projectId={projectId}
      title="Overview"
      description={project.name}
      context={state === "empty" ? undefined : context}
      onContextChange={state === "empty" ? undefined : setContext}
    >
      {state === "empty" ? (
        <ObserveOnboarding projectId={projectId} surface="overview" />
      ) : (
        <>
          <FirstSignalCelebration
            projectId={projectId}
            ready={state === "idle" && services.length > 0}
          />
          <SetupChecklist projectId={projectId} />
          <div
            className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-xs"
            data-testid="overview-health"
          >
            <span
              className={cn(
                "rounded-md px-2 py-0.5 font-medium",
                (overview?.error_rate ?? 0) > 0.05
                  ? "bg-destructive/15 text-destructive"
                  : (overview?.error_rate ?? 0) > 0.01
                    ? "bg-warning/15 text-warning"
                    : "bg-success/15 text-success",
              )}
            >
              {(overview?.error_rate ?? 0) > 0.05
                ? "Critical"
                : (overview?.error_rate ?? 0) > 0.01
                  ? "Degraded"
                  : "Healthy"}
            </span>
            <span className="text-muted-foreground">
              Availability{" "}
              {formatPercent(100 - (overview?.error_rate ?? 0) * 100)}
              {" · "}
              error rate {formatPercent((overview?.error_rate ?? 0) * 100)}
            </span>
          </div>
          <StatStrip
            loading={state === "loading"}
            items={[
              {
                label: "Request rate",
                value: formatRate(overview?.request_rate ?? 0, {
                  total: overview?.span_count,
                }).replace(/\/s$|\/h$/, ""),
                unit: formatRate(overview?.request_rate ?? 0, {
                  total: overview?.span_count,
                }).endsWith("/h")
                  ? "/h"
                  : "/s",
                onClick: () =>
                  void navigate({
                    to: "/observe/projects/$projectId/services",
                    params: { projectId },
                    search: serializeContext(context),
                  }),
              },
              {
                label: "Error rate",
                value: formatPercent((overview?.error_rate ?? 0) * 100).replace(
                  /%$/,
                  "",
                ),
                unit: "%",
                warn: (overview?.error_rate ?? 0) > 0.01,
                onClick: () =>
                  void navigate({
                    to: "/observe/projects/$projectId/traces",
                    params: { projectId },
                    search: serializeContext({
                      ...context,
                      tab: "traces",
                    }),
                  }),
              },
              {
                label: "p95 latency",
                value: (overview?.duration_p95_ms ?? 0).toFixed(0),
                unit: "ms",
                onClick: () =>
                  void navigate({
                    to: "/observe/projects/$projectId/traces",
                    params: { projectId },
                    search: serializeContext(context),
                  }),
              },
              {
                label: "Services",
                value: overview?.services ?? 0,
                onClick: () =>
                  void navigate({
                    to: "/observe/projects/$projectId/services",
                    params: { projectId },
                    search: serializeContext(context),
                  }),
              },
            ]}
          />
          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(16rem,1fr)]">
            <ChartFrame
              title="Traffic"
              description="Request rate over time"
              hint="Brush to zoom · click a point to dig in"
              state={
                state === "loading"
                  ? "loading"
                  : state === "error"
                    ? "error"
                    : "idle"
              }
            >
              <VisualizationCanvas
                kind="line"
                series={rate}
                height={200}
                valueLabel="Request rate"
                onBrush={(_a, _b, from, to) => {
                  setContext(digDownTime(context, from.t, to.t))
                }}
                onPointClick={(point) => {
                  const half = 5 * 60_000
                  setContext(
                    digDownTime(context, point.t - half, point.t + half),
                  )
                }}
              />
            </ChartFrame>
            <ChartFrame
              title="Alerts"
              description={
                alerts.length === 0
                  ? "Threshold and relative rules"
                  : `${alerts.filter((a) => a.enabled).length} enabled · ${alerts.length} total`
              }
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
                  Manage
                </Button>
              }
            >
              {alerts.length === 0 ? (
                <ObserveEmptyState
                  title="No alerts configured"
                  description="Create a threshold rule to get notified when error rate or latency spikes."
                  className="border-0 px-0 py-4"
                  action={
                    <Button
                      size="sm"
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
                />
              ) : (
                <ul className="divide-y divide-border/70">
                  {alerts.slice(0, 5).map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{a.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {a.lastTriggeredAt
                            ? `Fired ${formatRelative(new Date(a.lastTriggeredAt).getTime())}`
                            : "Never fired"}
                        </div>
                      </div>
                      <Badge
                        variant={a.enabled ? "secondary" : "outline"}
                        className="shrink-0 font-normal"
                      >
                        {a.enabled ? "On" : "Off"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </ChartFrame>
          </div>
          <ChartFrame title="Services" description="Sorted by volume">
            <DataTable
              state={
                state === "error"
                  ? "error"
                  : state === "loading"
                    ? "loading"
                    : "idle"
              }
              rows={services}
              emptyTitle="No services in this window"
              emptyDescription="Widen the time range or confirm telemetry is still flowing."
              columns={[
                {
                  id: "service",
                  header: "Service",
                  cell: (r) => (
                    <Link
                      to="/observe/projects/$projectId/services/$serviceName"
                      params={{ projectId, serviceName: r.service }}
                      search={serializeContext({
                        ...context,
                        query: { ...context.query, service: r.service },
                      })}
                      className="font-medium hover:underline"
                    >
                      {r.service}
                    </Link>
                  ),
                },
                {
                  id: "rate",
                  header: "Rate",
                  cell: (r) => (
                    <span className="tabular-nums">
                      {formatRate(r.request_rate, { total: r.span_count })}
                    </span>
                  ),
                },
                {
                  id: "errors",
                  header: "Errors",
                  cell: (r) => (
                    <span
                      className={cn(
                        "tabular-nums",
                        r.error_rate > 0.01 && "text-destructive",
                      )}
                    >
                      {(r.error_rate * 100).toFixed(1)}%
                    </span>
                  ),
                },
                {
                  id: "p95",
                  header: "p95",
                  cell: (r) => (
                    <span className="tabular-nums">
                      {r.duration_p95_ms.toFixed(0)}ms
                    </span>
                  ),
                },
                {
                  id: "spans",
                  header: "Spans",
                  cell: (r) => (
                    <span className="tabular-nums">
                      {r.span_count.toLocaleString()}
                    </span>
                  ),
                },
              ]}
            />
          </ChartFrame>
        </>
      )}
    </ObserveProjectShell>
  )
}
