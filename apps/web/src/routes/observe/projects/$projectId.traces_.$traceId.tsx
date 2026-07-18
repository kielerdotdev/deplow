import { useEffect, useMemo, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import {
  AttributeInspector,
  CorrelationLinks,
  ObserveEmptyState,
  ObserveProjectShell,
  ObserveStatusBadge,
} from "@/components/observe"
import { buildDebugPrompt } from "@/lib/observe/debug-prompt"
import { InlinePending } from "@/components/route-pending"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import {
  contextToApiInput,
  parseContext,
  resolveTimeRange,
  serializeContext,
  serializeTraceSearch,
  type FilterClause,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/observe/projects/$projectId/traces_/$traceId",
)({
  validateSearch: (search) =>
    serializeTraceSearch(
      parseContext(search),
      typeof search.span === "string" ? search.span : undefined,
    ),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const project = await client.projects.get({ id: params.projectId })
    const trace = await client.observe.traces
      .get({ projectId: params.projectId, traceId: params.traceId })
      .catch(() => ({ spans: [], partial: false, sampled: false }))
    return { project, trace }
  },
  component: TraceDetailPage,
})

function TraceDetailPage() {
  const { project, trace } = Route.useLoaderData()
  const { projectId, traceId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const context = parseContext(search)
  const spans = trace.spans
  const errorSpans = useMemo(
    () => spans.filter((s) => s.status.includes("ERROR")),
    [spans],
  )

  const selectedSpanId =
    search.span ??
    (errorSpans[0]?.span_id || spans[0]?.span_id || null)

  const selected =
    spans.find((s) => s.span_id === selectedSpanId) ?? spans[0] ?? null

  const [logs, setLogs] = useState<
    Array<{
      timestamp: string
      severity: string
      body: string
      service: string
      span_id: string
    }>
  >([])
  const [logsState, setLogsState] = useState<
    "loading" | "idle" | "error" | "empty"
  >("loading")
  const [logsReason, setLogsReason] = useState<string>("")

  function setContext(next: ObserveContext) {
    void navigate({
      search: serializeTraceSearch(next, search.span),
      replace: true,
    })
  }

  function selectSpan(spanId: string) {
    void navigate({
      search: serializeTraceSearch(context, spanId),
      replace: true,
    })
  }

  const { minTs, maxTs } = useMemo(() => {
    if (spans.length === 0) return { minTs: 0, maxTs: 1 }
    const starts = spans.map((s) => Date.parse(normalizeTs(s.start)))
    const ends = spans.map(
      (s) => Date.parse(normalizeTs(s.start)) + s.duration_ms,
    )
    return { minTs: Math.min(...starts), maxTs: Math.max(...ends) }
  }, [spans])

  const totalMs = Math.max(maxTs - minTs, 1)

  const related = useMemo(() => {
    if (!selected) return { parent: null as typeof selected, children: [] as typeof spans }
    const parent = selected.parent_span_id
      ? spans.find((s) => s.span_id === selected.parent_span_id) ?? null
      : null
    const children = spans.filter((s) => s.parent_span_id === selected.span_id)
    return { parent, children }
  }, [selected, spans])

  const criticalPath = useMemo(() => criticalPathIds(spans), [spans])
  const serviceColor = useMemo(() => {
    const map = new Map<string, string>()
    const colors = [
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
    ]
    let i = 0
    for (const s of spans) {
      if (!map.has(s.service)) {
        map.set(s.service, colors[i % colors.length]!)
        i++
      }
    }
    return map
  }, [spans])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLogsState("loading")
      try {
        const range = resolveTimeRange(context.time)
        // Prefer span/trace wall clock if wider context would miss logs
        const from = new Date(Math.min(minTs, range.from.getTime()) - 60_000)
        const to = new Date(Math.max(maxTs, range.to.getTime()) + 60_000)
        const result = await client.observe.logs.search({
          ...contextToApiInput(projectId, {
            ...context,
            time: {
              kind: "absolute",
              from: from.toISOString(),
              to: to.toISOString(),
            },
          }),
          traceId,
          spanId: selected?.span_id,
          limit: 100,
        })
        if (cancelled) return
        setLogs(
          result.map((l) => ({
            timestamp: l.timestamp,
            severity: l.severity,
            body: l.body,
            service: l.service,
            span_id: l.span_id,
          })),
        )
        if (result.length === 0) {
          setLogsState("empty")
          setLogsReason(
            selected?.span_id
              ? "No correlated logs for this span. Try clearing the span filter or widening the time range."
              : "No correlated logs found for this trace. Logs may be unavailable, sampled, or outside retention.",
          )
        } else {
          setLogsState("idle")
          setLogsReason("")
        }
      } catch {
        if (!cancelled) {
          setLogsState("error")
          setLogsReason("Could not load logs for this source.")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, traceId, selected?.span_id, search, minTs, maxTs])

  function addFilter(clause: FilterClause) {
    setContext({
      ...context,
      filters: [
        ...context.filters.filter(
          (f) => !(f.key === clause.key && f.op === clause.op),
        ),
        clause,
      ],
    })
  }

  const root = spans[0]
  const errorCount = errorSpans.length

  return (
    <ObserveProjectShell
      projectId={projectId}
      title={root?.name ? `${root.name}` : `Trace · ${project.name}`}
      description={`${traceId.slice(0, 16)}… · ${spans.length} spans${errorCount ? ` · ${errorCount} errors` : ""}`}
      context={context}
      onContextChange={setContext}
      actions={
        <div className="flex flex-wrap gap-2">
          {trace.partial ? <ObserveStatusBadge state="partial" /> : null}
          {trace.sampled ? <ObserveStatusBadge state="sampled" /> : null}
          {errorSpans[0] ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => selectSpan(errorSpans[0]!.span_id)}
            >
              Jump to error
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(traceId)
            }}
          >
            Copy trace ID
          </Button>
          {selected ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(
                  buildDebugPrompt({
                    kind: "span",
                    title: selected.name,
                    projectId,
                    traceId,
                    spanId: selected.span_id,
                    service: selected.service,
                    status: selected.status,
                    durationMs: selected.duration_ms,
                    attributes: selected.attributes as
                      | Record<string, string>
                      | undefined,
                  }),
                )
              }}
            >
              Copy as prompt
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(window.location.href)
            }}
          >
            Copy link
          </Button>
          <CorrelationLinks
            projectId={projectId}
            context={context}
            traceId={traceId}
            spanId={selected?.span_id}
            aroundMs={selected ? Date.parse(normalizeTs(selected.start)) : minTs}
          />
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(280px,360px)]">
        <div className="surface-panel overflow-hidden">
          <div className="border-b border-border/60 px-5 py-3.5">
            <h3 className="text-sm font-semibold tracking-tight">Waterfall</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {totalMs.toFixed(1)} ms total · service colors · critical path
              outlined
            </p>
          </div>
          <div className="flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto p-3">
            {spans.map((span) => {
              const start = Date.parse(normalizeTs(span.start))
              const left = ((start - minTs) / totalMs) * 100
              const width = Math.max((span.duration_ms / totalMs) * 100, 0.4)
              const depth = depthOf(span.span_id, spans)
              const isSelected = selected?.span_id === span.span_id
              const isRelated =
                related.parent?.span_id === span.span_id ||
                related.children.some((c) => c.span_id === span.span_id)
              const isError = span.status.includes("ERROR")
              const onCritical = criticalPath.has(span.span_id)
              const childrenDur = spans
                .filter((s) => s.parent_span_id === span.span_id)
                .reduce((s, c) => s + c.duration_ms, 0)
              const selfMs = Math.max(span.duration_ms - childrenDur, 0)
              return (
                <button
                  key={span.span_id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50",
                    isSelected && "bg-muted/70 ring-1 ring-ring/30",
                    !isSelected && isRelated && "bg-muted/30",
                    onCritical && "ring-1 ring-chart-selection/50",
                  )}
                  style={{ paddingLeft: 8 + depth * 12 }}
                  onClick={() => selectSpan(span.span_id)}
                  title={`Self ${selfMs.toFixed(0)}ms · Total ${span.duration_ms.toFixed(0)}ms${onCritical ? " · critical path" : ""}`}
                >
                  {isError ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-destructive"
                      aria-label="Error"
                    />
                  ) : (
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{
                        background: serviceColor.get(span.service) ?? "var(--muted-foreground)",
                      }}
                    />
                  )}
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
                        isError && "opacity-90",
                      )}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: isError
                          ? "var(--chart-error)"
                          : (serviceColor.get(span.service) ??
                            "var(--chart-1)"),
                        outline: onCritical
                          ? "1px solid var(--chart-selection)"
                          : undefined,
                      }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                    {span.duration_ms.toFixed(0)}ms
                  </span>
                </button>
              )
            })}
            {spans.length === 0 ? (
              <ObserveEmptyState
                title="Trace not found"
                description="This trace may have expired, been sampled out, or never arrived."
              />
            ) : null}
          </div>
        </div>

        <div className="surface-panel flex min-h-[240px] flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border/60 px-5 py-3.5">
            <h3 className="text-sm font-semibold tracking-tight">
              Logs & errors
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Filtered by trace
              {selected ? " · span when selected" : ""}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {logsState === "loading" ? (
              <div className="px-4">
                <InlinePending label="Loading logs…" />
              </div>
            ) : null}
            {logsState === "error" || logsState === "empty" ? (
              <div className="p-4">
                <ObserveEmptyState
                  title={
                    logsState === "error"
                      ? "Logs unavailable"
                      : "No correlated logs"
                  }
                  description={logsReason}
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void navigate({
                            search: serializeTraceSearch(
                              {
                                ...context,
                                query: {
                                  ...context.query,
                                  traceId,
                                  spanId: undefined,
                                },
                              },
                              undefined,
                            ),
                            replace: true,
                          })
                        }
                      >
                        Clear span filter
                      </Button>
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
                        Open logs page
                      </Button>
                    </div>
                  }
                />
              </div>
            ) : null}
            {logsState === "idle"
              ? logs.map((l, i) => (
                  <button
                    key={`${l.timestamp}-${i}`}
                    type="button"
                    className={cn(
                      "flex w-full gap-2 border-b border-border/40 px-4 py-2 text-left text-xs hover:bg-muted/40",
                      l.span_id &&
                        l.span_id === selected?.span_id &&
                        "bg-muted/30",
                    )}
                    onClick={() => {
                      if (l.span_id) selectSpan(l.span_id)
                    }}
                  >
                    <span className="w-20 shrink-0 font-mono text-[10px] text-muted-foreground">
                      {l.timestamp.slice(11, 23)}
                    </span>
                    <span
                      className={cn(
                        "w-12 shrink-0 uppercase",
                        l.severity?.toLowerCase() === "error" &&
                          "text-destructive",
                      )}
                    >
                      {l.severity || "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{l.body}</span>
                  </button>
                ))
              : null}
          </div>
        </div>

        <aside className="surface-panel flex min-h-[280px] flex-col overflow-hidden xl:sticky xl:top-20 xl:max-h-[calc(100vh-7rem)]">
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
              <div className="min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-5">
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="surface-inset px-3 py-2.5">
                    <dt className="text-muted-foreground">Service</dt>
                    <dd className="mt-0.5 font-medium">{selected.service}</dd>
                  </div>
                  <div className="surface-inset px-3 py-2.5">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd
                      className={cn(
                        "mt-0.5 font-medium",
                        selected.status.includes("ERROR") &&
                          "text-destructive",
                      )}
                    >
                      {selected.status}
                    </dd>
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
                <CorrelationLinks
                  projectId={projectId}
                  context={context}
                  traceId={traceId}
                  spanId={selected.span_id}
                />
                <AttributeInspector
                  attributes={selected.attributes}
                  projectId={projectId}
                  context={{
                    ...context,
                    query: { ...context.query, traceId },
                  }}
                  onAddFilter={addFilter}
                />
                <AttributeInspector
                  attributes={selected.resource}
                  title="Resource"
                  projectId={projectId}
                  context={context}
                  onAddFilter={addFilter}
                />
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

/** Longest root→leaf path by duration (critical path). */
function criticalPathIds(
  spans: Array<{
    span_id: string
    parent_span_id: string
    duration_ms: number
  }>,
): Set<string> {
  if (spans.length === 0) return new Set()
  const children = new Map<string, string[]>()
  const roots: string[] = []
  for (const s of spans) {
    if (!s.parent_span_id || !spans.some((x) => x.span_id === s.parent_span_id)) {
      roots.push(s.span_id)
    } else {
      const list = children.get(s.parent_span_id) ?? []
      list.push(s.span_id)
      children.set(s.parent_span_id, list)
    }
  }
  const byId = new Map(spans.map((s) => [s.span_id, s]))
  let best: string[] = []
  let bestDur = -1
  function walk(id: string, path: string[], dur: number) {
    const kids = children.get(id) ?? []
    if (kids.length === 0) {
      if (dur > bestDur) {
        bestDur = dur
        best = path
      }
      return
    }
    for (const kid of kids) {
      const span = byId.get(kid)
      if (!span) continue
      walk(kid, [...path, kid], dur + span.duration_ms)
    }
  }
  for (const r of roots) {
    const span = byId.get(r)
    if (!span) continue
    walk(r, [r], span.duration_ms)
  }
  return new Set(best)
}
