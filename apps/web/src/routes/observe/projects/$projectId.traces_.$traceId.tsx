import { useEffect, useMemo, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  AttributeInspector,
  ObserveProjectShell,
  ObserveStatusBadge,
} from "@/components/observe"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import {
  parseContext,
  serializeContext,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/observe/projects/$projectId/traces_/$traceId",
)({
  validateSearch: (search) => serializeContext(parseContext(search)),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const shell = await loadShellContext()
    const status = await client.observe.status().catch(() => null)
    const project = await client.projects.get({ id: params.projectId })
    const trace = await client.observe.traces
      .get({ projectId: params.projectId, traceId: params.traceId })
      .catch(() => ({ spans: [], partial: false, sampled: false }))
    return { session, shell, status, project, trace }
  },
  component: TraceDetailPage,
})

function TraceDetailPage() {
  const { session, shell, status, project, trace } = Route.useLoaderData()
  const { projectId, traceId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const context = parseContext(search)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)

  function setContext(next: ObserveContext) {
    void navigate({ search: serializeContext(next), replace: true })
  }

  const spans = trace.spans
  const selected = spans.find((s) => s.span_id === selectedSpanId) ?? spans[0]

  const { minTs, maxTs } = useMemo(() => {
    if (spans.length === 0) return { minTs: 0, maxTs: 1 }
    const starts = spans.map((s) => Date.parse(normalizeTs(s.start)))
    const ends = spans.map(
      (s) => Date.parse(normalizeTs(s.start)) + s.duration_ms,
    )
    return { minTs: Math.min(...starts), maxTs: Math.max(...ends) }
  }, [spans])

  const totalMs = Math.max(maxTs - minTs, 1)

  useEffect(() => {
    if (!selectedSpanId && spans[0]) setSelectedSpanId(spans[0].span_id)
  }, [spans, selectedSpanId])

  return (
    <ObserveProjectShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      observeEnabled={status?.enabled === true}
      projectId={projectId}
      title={`Trace · ${project.name}`}
      description={traceId}
      context={context}
      onContextChange={setContext}
      actions={
        <div className="flex gap-2">
          {trace.partial ? <ObserveStatusBadge state="partial" /> : null}
          {trace.sampled ? <ObserveStatusBadge state="sampled" /> : null}
          <Button
            size="sm"
            variant="outline"
            render={
              <Link
                to="/observe/projects/$projectId/logs"
                params={{ projectId }}
                search={serializeContext({
                  ...context,
                  query: { ...context.query, traceId },
                })}
              />
            }
          >
            Correlated logs
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="surface-panel overflow-hidden">
          <div className="border-b border-border/60 px-5 py-3.5">
            <h3 className="text-sm font-semibold tracking-tight">Waterfall</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Click a span to inspect attributes
            </p>
          </div>
          <div className="space-y-0.5 p-3">
            {spans.map((span) => {
              const start = Date.parse(normalizeTs(span.start))
              const left = ((start - minTs) / totalMs) * 100
              const width = Math.max((span.duration_ms / totalMs) * 100, 0.4)
              const depth = depthOf(span.span_id, spans)
              return (
                <button
                  key={span.span_id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50",
                    selected?.span_id === span.span_id && "bg-muted/70",
                  )}
                  style={{ paddingLeft: 8 + depth * 12 }}
                  onClick={() => setSelectedSpanId(span.span_id)}
                >
                  <span className="w-36 shrink-0 truncate font-medium">
                    {span.name}
                  </span>
                  <span className="w-24 shrink-0 truncate text-muted-foreground">
                    {span.service}
                  </span>
                  <div className="relative h-4 flex-1 rounded-sm bg-muted/50">
                    <div
                      className={cn(
                        "absolute top-0.5 h-3 rounded-sm",
                        span.status.includes("ERROR")
                          ? "bg-destructive/80"
                          : "bg-chart-1/80",
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                    {span.duration_ms.toFixed(0)}ms
                  </span>
                </button>
              )
            })}
            {spans.length === 0 ? (
              <p className="px-2 py-8 text-sm text-muted-foreground">
                Trace not found or expired.
              </p>
            ) : null}
          </div>
        </div>

        <aside className="surface-panel flex min-h-[280px] flex-col overflow-hidden lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)]">
          {selected ? (
            <>
              <header className="shrink-0 border-b border-border/60 px-5 py-4">
                <h3 className="truncate text-sm font-semibold tracking-tight">
                  {selected.name}
                </h3>
                <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">
                  {selected.span_id}
                </p>
              </header>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="surface-inset px-3 py-2.5">
                    <dt className="text-muted-foreground">Service</dt>
                    <dd className="mt-0.5 font-medium">{selected.service}</dd>
                  </div>
                  <div className="surface-inset px-3 py-2.5">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="mt-0.5 font-medium">{selected.status}</dd>
                  </div>
                  <div className="surface-inset px-3 py-2.5">
                    <dt className="text-muted-foreground">Duration</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      {selected.duration_ms.toFixed(2)}ms
                    </dd>
                  </div>
                  <div className="surface-inset px-3 py-2.5">
                    <dt className="text-muted-foreground">Kind</dt>
                    <dd className="mt-0.5 font-medium">{selected.kind}</dd>
                  </div>
                </dl>
                <AttributeInspector attributes={selected.attributes} />
                <AttributeInspector
                  attributes={selected.resource}
                  title="Resource"
                />
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link
                      to="/observe/projects/$projectId/logs"
                      params={{ projectId }}
                      search={serializeContext({
                        ...context,
                        query: {
                          ...context.query,
                          traceId,
                          spanId: selected.span_id,
                        },
                      })}
                    />
                  }
                >
                  Open logs for span
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-5 py-10 text-sm text-muted-foreground">
              Select a span
            </div>
          )}
        </aside>
      </div>
    </ObserveProjectShell>
  )
}

function normalizeTs(ts: string): string {
  if (ts.includes("T")) return ts.endsWith("Z") ? ts : `${ts}Z`
  return `${ts.replace(" ", "T")}Z`
}

function depthOf(
  spanId: string,
  spans: Array<{ span_id: string; parent_span_id: string }>,
): number {
  const byId = new Map(spans.map((s) => [s.span_id, s]))
  let depth = 0
  let cur = byId.get(spanId)
  const seen = new Set<string>()
  while (cur?.parent_span_id && byId.has(cur.parent_span_id)) {
    if (seen.has(cur.span_id)) break
    seen.add(cur.span_id)
    depth++
    cur = byId.get(cur.parent_span_id)
  }
  return depth
}
