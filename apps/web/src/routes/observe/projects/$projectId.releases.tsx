import { useEffect, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  AnnotationLayer,
  ChartFrame,
  DataTable,
  ObserveProjectShell,
  VisualizationCanvas,
} from "@/components/observe"
import { getSession } from "@/lib/auth.functions"
import {
  contextToApiInput,
  digDownTime,
  parseContext,
  resolveTimeRange,
  serializeContext,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/observe/projects/$projectId/releases")({
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
  component: ReleasesPage,
})

function ReleasesPage() {
  const { session, shell, status, project } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const context = parseContext(search)
  const [rows, setRows] = useState<
    Array<{
      id: string
      release: string
      first_seen: string
      last_seen: string
      span_count: number
      error_count: number
    }>
  >([])
  const [rate, setRate] = useState<Array<{ t: number; v: number }>>([])

  function setContext(next: ObserveContext) {
    void navigate({ search: serializeContext(next), replace: true })
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const input = contextToApiInput(projectId, context)
      const [releases, series] = await Promise.all([
        client.observe.releases.list({
          projectId,
          from: input.from,
          to: input.to,
        }),
        client.observe.charts.series({ ...input, metric: "errors" }),
      ])
      if (cancelled) return
      setRows(
        releases.map((r) => ({
          id: r.release,
          ...r,
        })),
      )
      setRate(series)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, search])

  const range = resolveTimeRange(context.time)
  const annotations = rows.slice(0, 8).map((r) => ({
    id: r.release,
    at: Date.parse(
      r.first_seen.includes("T")
        ? r.first_seen
        : `${r.first_seen.replace(" ", "T")}Z`,
    ),
    label: r.release,
    kind: "release" as const,
  }))

  return (
    <ObserveProjectShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      observeEnabled={status?.enabled === true}
      projectId={projectId}
      title={`Releases · ${project.name}`}
      description="Release attributes from spans; use as Explore baseline pre/post."
      context={context}
      onContextChange={setContext}
    >
      <ChartFrame
        title="Errors with release annotations"
        hint="Use the brush below to zoom · click a point to dig in"
        className="mb-4"
      >
        <div className="relative">
          <VisualizationCanvas
            kind="line"
            series={rate}
            height={200}
            valueLabel="Errors"
            onBrush={(_a, _b, from, to) => {
              setContext(digDownTime(context, from.t, to.t))
            }}
            onPointClick={(point) => {
              const half = 5 * 60_000
              setContext(digDownTime(context, point.t - half, point.t + half))
            }}
          />
          <AnnotationLayer
            className="inset-x-12 top-2 bottom-10"
            annotations={annotations}
            range={{ from: range.from.getTime(), to: range.to.getTime() }}
          />
        </div>
      </ChartFrame>
      <div className="surface-panel overflow-hidden">
        <DataTable
          rows={rows}
          columns={[
            {
              id: "rel",
              header: "Release",
              cell: (r) => (
                <Link
                  to="/observe/projects/$projectId/explore"
                  params={{ projectId }}
                  search={serializeContext({
                    ...context,
                    query: { ...context.query, release: r.release },
                    baseline: { mode: "previous" },
                  })}
                  className="font-mono text-sm hover:underline"
                >
                  {r.release}
                </Link>
              ),
            },
            { id: "spans", header: "Spans", cell: (r) => r.span_count },
            { id: "err", header: "Errors", cell: (r) => r.error_count },
            { id: "first", header: "First seen", cell: (r) => r.first_seen },
          ]}
          emptyTitle="No releases"
          emptyDescription="Set service.version on OTLP resources to populate releases."
        />
      </div>
    </ObserveProjectShell>
  )
}
