import { useEffect, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  ChartFrame,
  DataTable,
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
  serializeTraceSearch,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"

export const Route = createFileRoute(
  "/observe/projects/$projectId/services_/$serviceName",
)({
  validateSearch: (search) => serializeContext(parseContext(search)),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const project = await client.projects.get({ id: params.projectId })
    return { project }
  },
  component: ServiceDetailPage,
})

function ServiceDetailPage() {
  const { project } = Route.useLoaderData()
  const { projectId, serviceName } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const base = parseContext(search)
  const context: ObserveContext = {
    ...base,
    query: { ...base.query, service: serviceName },
  }

  const [ops, setOps] = useState<
    Array<{
      id: string
      operation: string
      request_rate: number
      error_rate: number
      duration_p95_ms: number
      span_count: number
    }>
  >([])
  const [errors, setErrors] = useState<
    Array<{
      id: string
      trace_id: string
      root_name: string
      duration_ms: number
      status: string
    }>
  >([])
  const [p95, setP95] = useState<Array<{ t: number; v: number }>>([])

  function setContext(next: ObserveContext) {
    void navigate({
      search: serializeContext({
        ...next,
        query: { ...next.query, service: serviceName },
      }),
      replace: true,
    })
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const input = contextToApiInput(projectId, context)
      const [operations, recent, series] = await Promise.all([
        client.observe.services.operations({ ...input, service: serviceName }),
        client.observe.services.recentErrors({
          ...input,
          service: serviceName,
        }),
        client.observe.charts.series({
          ...input,
          service: serviceName,
          metric: "duration_p95",
        }),
      ])
      if (cancelled) return
      setOps(
        operations.map((o) => ({
          id: o.operation,
          operation: o.operation,
          request_rate: o.request_rate,
          error_rate: o.error_rate,
          duration_p95_ms: o.duration_p95_ms,
          span_count: o.span_count,
        })),
      )
      setErrors(
        recent.map((t) => ({
          id: t.trace_id,
          trace_id: t.trace_id,
          root_name: t.root_name,
          duration_ms: t.duration_ms,
          status: t.status,
        })),
      )
      setP95(series)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, serviceName, search])

  return (
    <ObserveProjectShell
      projectId={projectId}
      title={`${serviceName} · ${project.name}`}
      description="RED, operations, and recent errors for this service."
      context={context}
      onContextChange={setContext}
      actions={
        <Button
          size="sm"
          variant="outline"
          render={
            <Link
              to="/observe/projects/$projectId/traces"
              params={{ projectId }}
              search={serializeContext(context)}
            />
          }
        >
          Traces
        </Button>
      }
    >
      <ChartFrame
        title="p95 latency"
        hint="Use the brush below to zoom · click a point to dig in"
        className="mb-4"
      >
        <VisualizationCanvas
          kind="line"
          series={p95}
          height={180}
          valueLabel="p95 ms"
          onBrush={(_a, _b, from, to) => {
            setContext(digDownTime(context, from.t, to.t))
          }}
          onPointClick={(point) => {
            const half = 5 * 60_000
            setContext(digDownTime(context, point.t - half, point.t + half))
          }}
        />
      </ChartFrame>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Operations">
          <DataTable
            rows={ops}
            columns={[
              {
                id: "op",
                header: "Operation",
                cell: (r) => (
                  <Link
                    to="/observe/projects/$projectId/traces"
                    params={{ projectId }}
                    search={serializeContext({
                      ...context,
                      query: {
                        ...context.query,
                        service: serviceName,
                        operation: r.operation,
                      },
                    })}
                    className="hover:underline"
                  >
                    {r.operation}
                  </Link>
                ),
              },
              {
                id: "rate",
                header: "Rate",
                cell: (r) => `${r.request_rate.toFixed(2)}/s`,
              },
              {
                id: "err",
                header: "Err%",
                cell: (r) => `${(r.error_rate * 100).toFixed(1)}%`,
              },
              {
                id: "p95",
                header: "p95",
                cell: (r) => `${r.duration_p95_ms.toFixed(0)}ms`,
              },
            ]}
          />
        </ChartFrame>
        <ChartFrame title="Recent errors">
          <DataTable
            rows={errors}
            columns={[
              {
                id: "name",
                header: "Root",
                cell: (r) => (
                  <Link
                    to="/observe/projects/$projectId/traces/$traceId"
                    params={{ projectId, traceId: r.trace_id }}
                    search={serializeTraceSearch(context)}
                    className="font-mono text-xs hover:underline"
                  >
                    {r.root_name}
                  </Link>
                ),
              },
              {
                id: "dur",
                header: "Duration",
                cell: (r) => `${r.duration_ms.toFixed(0)}ms`,
              },
            ]}
          />
        </ChartFrame>
      </div>
    </ObserveProjectShell>
  )
}
