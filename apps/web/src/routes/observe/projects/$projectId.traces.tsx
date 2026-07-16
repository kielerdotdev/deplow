import { useEffect, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import { DataTable, ObserveProjectShell } from "@/components/observe"
import { getSession } from "@/lib/auth.functions"
import {
  contextToApiInput,
  parseContext,
  serializeContext,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/observe/projects/$projectId/traces")({
  validateSearch: (search) => serializeContext(parseContext(search)),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const shell = await loadShellContext()
    const status = await client.observe.status().catch(() => null)
    const project = await client.projects.get({ id: params.projectId })
    return { session, shell, status, project }
  },
  component: TracesPage,
})

function TracesPage() {
  const { session, shell, status, project } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const context = parseContext(search)
  const [rows, setRows] = useState<
    Array<{
      id: string
      trace_id: string
      service: string
      root_name: string
      duration_ms: number
      span_count: number
      status: string
      start: string
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
        const list = await client.observe.traces.list(
          contextToApiInput(projectId, context),
        )
        if (cancelled) return
        setRows(
          list.map((t) => ({
            id: t.trace_id,
            ...t,
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
      title={`Traces · ${project.name}`}
      description="Search and open waterfalls. Context carries into detail."
      context={context}
      onContextChange={setContext}
    >
      <div className="surface-panel overflow-hidden">
        <DataTable
          state={state}
          rows={rows}
          columns={[
            {
              id: "root",
              header: "Root span",
              cell: (r) => (
                <Link
                  to="/observe/projects/$projectId/traces/$traceId"
                  params={{ projectId, traceId: r.trace_id }}
                  search={serializeContext(context)}
                  className="font-medium hover:underline"
                >
                  {r.root_name}
                </Link>
              ),
            },
            { id: "svc", header: "Service", cell: (r) => r.service },
            {
              id: "dur",
              header: "Duration",
              cell: (r) => `${r.duration_ms.toFixed(0)}ms`,
            },
            { id: "spans", header: "Spans", cell: (r) => r.span_count },
            { id: "status", header: "Status", cell: (r) => r.status },
          ]}
        />
      </div>
    </ObserveProjectShell>
  )
}
