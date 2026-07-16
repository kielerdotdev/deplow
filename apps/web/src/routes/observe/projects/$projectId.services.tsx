import { useEffect, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  DataTable,
  ObserveProjectShell,
} from "@/components/observe"
import { getSession } from "@/lib/auth.functions"
import {
  contextToApiInput,
  parseContext,
  serializeContext,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/observe/projects/$projectId/services")({
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
  component: ServicesPage,
})

function ServicesPage() {
  const { session, shell, status, project } = Route.useLoaderData()
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
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      observeEnabled={status?.enabled === true}
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
              cell: (r) => `${r.request_rate.toFixed(2)}/s`,
            },
            {
              id: "err",
              header: "Error %",
              cell: (r) => `${(r.error_rate * 100).toFixed(2)}%`,
            },
            {
              id: "p50",
              header: "p50",
              cell: (r) => `${r.duration_p50_ms.toFixed(0)}ms`,
            },
            {
              id: "p95",
              header: "p95",
              cell: (r) => `${r.duration_p95_ms.toFixed(0)}ms`,
            },
            {
              id: "n",
              header: "Spans",
              cell: (r) => r.span_count.toLocaleString(),
            },
          ]}
          emptyTitle="No services"
          emptyDescription="Ingest OTLP spans to populate the service list."
        />
      </div>
    </ObserveProjectShell>
  )
}
