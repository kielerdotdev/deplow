import { useEffect, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

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
  contextToApiInput,
  digDownTime,
  parseContext,
  serializeContext,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/observe/projects/$projectId/")({
  validateSearch: (search) => serializeContext(parseContext(search)),
  loader: async ({ params }) => {
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
    return { session, shell, status, project }
  },
  component: OverviewPage,
})

function OverviewPage() {
  const { session, shell, status, project } = Route.useLoaderData()
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
        const [ov, series, list, issues] = await Promise.all([
          client.observe.services.overview(input),
          client.observe.charts.series({ ...input, metric: "rate" }),
          client.observe.services.list(input),
          client.observe.issues
            .list({ projectId, status: "unresolved" })
            .catch(() => []),
        ])
        if (cancelled) return
        setOverview(ov)
        setRate(series)
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
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      observeEnabled={status?.enabled === true}
      projectId={projectId}
      title={`Overview · ${project.name}`}
      description="Global RED and hottest services in the current Context."
      context={state === "empty" ? undefined : context}
      onContextChange={state === "empty" ? undefined : setContext}
    >
      {state === "empty" ? (
        <ObserveOnboarding projectId={projectId} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <ChartFrame
              title="Request rate"
              state={state === "loading" ? "loading" : "idle"}
            >
              <VisualizationCanvas
                kind="number"
                number={{
                  value: overview?.request_rate ?? 0,
                  unit: "/s",
                }}
                onNumberClick={() =>
                  void navigate({
                    to: "/observe/projects/$projectId/services",
                    params: { projectId },
                    search: serializeContext(context),
                  })
                }
              />
            </ChartFrame>
            <ChartFrame
              title="Error rate"
              state={state === "loading" ? "loading" : "idle"}
            >
              <VisualizationCanvas
                kind="number"
                number={{
                  value: (overview?.error_rate ?? 0) * 100,
                  unit: "%",
                }}
                onNumberClick={() =>
                  void navigate({
                    to: "/observe/projects/$projectId/explore",
                    params: { projectId },
                    search: serializeContext({
                      ...context,
                      tab: "traces",
                    }),
                  })
                }
              />
            </ChartFrame>
            <ChartFrame
              title="p95 latency"
              state={state === "loading" ? "loading" : "idle"}
            >
              <VisualizationCanvas
                kind="number"
                number={{
                  value: overview?.duration_p95_ms ?? 0,
                  unit: "ms",
                }}
                onNumberClick={() =>
                  void navigate({
                    to: "/observe/projects/$projectId/explore",
                    params: { projectId },
                    search: serializeContext(context),
                  })
                }
              />
            </ChartFrame>
            <ChartFrame
              title="Services"
              state={state === "loading" ? "loading" : "idle"}
            >
              <VisualizationCanvas
                kind="number"
                number={{ value: overview?.services ?? 0 }}
                onNumberClick={() =>
                  void navigate({
                    to: "/observe/projects/$projectId/services",
                    params: { projectId },
                    search: serializeContext(context),
                  })
                }
              />
            </ChartFrame>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ChartFrame
              title="Traffic"
              description="Request rate over time"
              hint="Use the brush below to zoom · click a point to dig in"
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
              title="Active alerts"
              description="Threshold and relative alerts"
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
              <ObserveEmptyState
                title="No firing alerts"
                description="Create threshold alerts from Explore or Alerts."
                className="border-0 px-0 py-4"
              />
            </ChartFrame>
          </div>
          <div className="mt-4">
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
                    cell: (r) => `${r.request_rate.toFixed(2)}/s`,
                  },
                  {
                    id: "errors",
                    header: "Errors",
                    cell: (r) => `${(r.error_rate * 100).toFixed(1)}%`,
                  },
                  {
                    id: "p95",
                    header: "p95",
                    cell: (r) => `${r.duration_p95_ms.toFixed(0)}ms`,
                  },
                  {
                    id: "spans",
                    header: "Spans",
                    cell: (r) => r.span_count.toLocaleString(),
                  },
                ]}
              />
            </ChartFrame>
          </div>
        </>
      )}
    </ObserveProjectShell>
  )
}
