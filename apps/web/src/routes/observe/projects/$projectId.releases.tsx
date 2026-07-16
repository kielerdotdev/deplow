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
  applyColdDefaults,
  contextToApiInput,
  digDownTime,
  parseContext,
  resolveTimeRange,
  serializeContext,
  type ObserveContext,
} from "@/lib/observe/context"
import { formatRelative, formatTimestampMs } from "@/lib/observe/format"
import { missingCopy } from "@/lib/observe/missing"
import { client } from "@/lib/orpc"

export const Route = createFileRoute("/observe/projects/$projectId/releases")({
  validateSearch: (search) =>
    serializeContext(
      parseContext(
        applyColdDefaults("releases", search as Record<string, unknown>),
      ),
    ),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const project = await client.projects.get({ id: params.projectId })
    return { project }
  },
  component: ReleasesPage,
})

function ReleasesPage() {
  const { project } = Route.useLoaderData()
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
  const [state, setState] = useState<"loading" | "idle" | "error">("loading")

  function setContext(next: ObserveContext) {
    void navigate({ search: serializeContext(next), replace: true })
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setState("loading")
      try {
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
        setState("idle")
      } catch {
        if (!cancelled) setState("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, search])

  const range = resolveTimeRange(context.time)
  const realReleases = rows.filter(
    (r) => r.release !== "unknown" && r.release !== "dev",
  )
  const unknownCount = rows
    .filter((r) => r.release === "unknown" || r.release === "dev")
    .reduce((s, r) => s + r.span_count, 0)
  const annotations = realReleases.slice(0, 8).map((r) => ({
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
      projectId={projectId}
      title={`Releases · ${project.name}`}
      description="Compare error and traffic impact across versions in the selected window."
      context={context}
      onContextChange={setContext}
    >
      {unknownCount > 0 ? (
        <div
          role="status"
          className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
        >
          <p className="font-medium">{missingCopy("unknown_release").title}</p>
          <p className="text-muted-foreground">
            {unknownCount.toLocaleString()} spans lack a usable version.{" "}
            {missingCopy("no_release").detail}
          </p>
        </div>
      ) : null}
      <ChartFrame
        title="Errors with release annotations"
        hint="Use the brush below to zoom · click a point to dig in"
        className="mb-4"
        state={state}
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
          state={state}
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
            {
              id: "spans",
              header: "Spans",
              cell: (r) => (
                <span className="tabular-nums">
                  {r.span_count.toLocaleString()}
                </span>
              ),
            },
            {
              id: "err",
              header: "Errors",
              cell: (r) => (
                <span className="tabular-nums">
                  {r.error_count.toLocaleString()}
                </span>
              ),
            },
            {
              id: "first",
              header: "First seen",
              cell: (r) => {
                const ts = Date.parse(
                  r.first_seen.includes("T")
                    ? r.first_seen
                    : `${r.first_seen.replace(" ", "T")}Z`,
                )
                return (
                  <span
                    className="text-xs text-muted-foreground tabular-nums"
                    title={formatTimestampMs(ts)}
                  >
                    {Number.isNaN(ts) ? r.first_seen : formatRelative(ts)}
                  </span>
                )
              },
            },
          ]}
          emptyTitle="No releases"
          emptyDescription={missingCopy("no_release").detail}
        />
      </div>
    </ObserveProjectShell>
  )
}
