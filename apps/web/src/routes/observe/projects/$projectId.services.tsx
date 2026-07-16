import { useEffect, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  DataTable,
  ObserveProjectShell,
} from "@/components/observe"
import { getSession } from "@/lib/auth.functions"
import {
  applyColdDefaults,
  contextToApiInput,
  parseContext,
  serializeContext,
  type ObserveContext,
} from "@/lib/observe/context"
import { formatPercent, formatRate } from "@/lib/observe/format"
import { client } from "@/lib/orpc"

export const Route = createFileRoute("/observe/projects/$projectId/services")({
  validateSearch: (search) =>
    serializeContext(
      parseContext(
        applyColdDefaults("services", search as Record<string, unknown>),
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
  component: ServicesPage,
})

function ServicesPage() {
  const { project } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const context = parseContext(search)
  const [rows, setRows] = useState<
    Array<{
      id: string
      service: string
      request_rate: number
      error_rate: number
      duration_p50_ms: number
      duration_p95_ms: number
      span_count: number
    }>
  >([])
  const [state, setState] = useState<"loading" | "idle" | "error">("loading")

  function setContext(next: ObserveContext) {
    void navigate({ search: serializeContext(next), replace: true })
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setState("loading")
      try {
        const list = await client.observe.services.list(
          contextToApiInput(projectId, context),
        )
        if (cancelled) return
        setRows(
          list.map((s) => ({
            id: s.service,
            ...s,
          })),
        )
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
      projectId={projectId}
      title={`Services · ${project.name}`}
      description="Service inventory with RED metrics."
      context={context}
      onContextChange={setContext}
    >
      <div className="surface-panel overflow-hidden">
        <DataTable
          state={state}
          rows={rows}
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
                <span className="tabular-nums">{formatRate(r.request_rate, { total: r.span_count })}</span>
              ),
            },
            {
              id: "err",
              header: "Error %",
              cell: (r) => (
                <span className="tabular-nums">{formatPercent(r.error_rate * 100)}</span>
              ),
            },
            {
              id: "p50",
              header: "p50",
              cell: (r) => (
                <span className="tabular-nums">{`${r.duration_p50_ms.toFixed(0)}ms`}</span>
              ),
            },
            {
              id: "p95",
              header: "p95",
              cell: (r) => (
                <span className="tabular-nums">{`${r.duration_p95_ms.toFixed(0)}ms`}</span>
              ),
            },
            {
              id: "n",
              header: "Spans",
              cell: (r) => (
                <span className="tabular-nums">{r.span_count.toLocaleString()}</span>
              ),
            },
          ]}
          emptyTitle="No services"
          emptyDescription="Ingest OTLP spans to populate the service list."
        />
      </div>
    </ObserveProjectShell>
  )
}
