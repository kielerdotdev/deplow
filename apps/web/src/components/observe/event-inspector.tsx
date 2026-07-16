import { useMemo, useState } from "react"

import { AttributeInspector } from "./attribute-inspector"
import { BreadcrumbsView, parseBreadcrumbs } from "./breadcrumbs-view"
import { CorrelationLinks } from "./correlation-links"
import { ExceptionChainView } from "./stack-frames"
import { cn } from "@/lib/utils"
import type { FilterClause, ObserveContext } from "@/lib/observe/context"

type EventLike = {
  event_id: string
  timestamp?: string
  level?: string
  message?: string
  culprit?: string
  environment?: string
  release?: string
  platform?: string
  transaction_name?: string
  trace_id?: string
  user_id?: string
  tags?: Record<string, string>
  exception_json?: string
  breadcrumbs_json?: string
  contexts_json?: string
  raw_json?: string
}

const TABS = [
  ["stack", "Stack"],
  ["breadcrumbs", "Breadcrumbs"],
  ["tags", "Tags"],
  ["context", "Context"],
  ["json", "JSON"],
] as const

type TabId = (typeof TABS)[number][0]

export function EventInspector({
  event,
  projectId,
  context,
  issueId,
  onAddFilter,
  onContextChange,
  compact,
}: {
  event: EventLike | null
  projectId: string
  context: ObserveContext
  issueId?: string
  onAddFilter?: (clause: FilterClause) => void
  onContextChange?: (ctx: ObserveContext) => void
  compact?: boolean
}) {
  const [tab, setTab] = useState<TabId>("stack")
  const breadcrumbs = useMemo(
    () => parseBreadcrumbs(event?.breadcrumbs_json ?? ""),
    [event?.breadcrumbs_json],
  )
  const contexts = useMemo(() => {
    try {
      return event?.contexts_json
        ? (JSON.parse(event.contexts_json) as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }, [event?.contexts_json])

  if (!event) {
    return (
      <p className="text-sm text-muted-foreground">No event selected</p>
    )
  }

  const tags = event.tags ?? {}
  const highlightKeys = [
    "environment",
    "release",
    "handled",
    "transaction",
    "browser.name",
    "os.name",
  ]
  const highlights = [
    event.environment ? ["environment", event.environment] : null,
    event.release ? ["release", event.release] : null,
    event.transaction_name
      ? ["transaction", event.transaction_name]
      : null,
    ...highlightKeys
      .filter((k) => tags[k] && k !== "environment" && k !== "release")
      .map((k) => [k, tags[k]!] as const),
  ].filter(Boolean) as Array<[string, string]>

  function addFilter(clause: FilterClause) {
    if (onAddFilter) {
      onAddFilter(clause)
      return
    }
    if (onContextChange) {
      onContextChange({
        ...context,
        filters: [
          ...context.filters.filter(
            (f) => !(f.key === clause.key && f.op === clause.op),
          ),
          clause,
        ],
      })
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="event-inspector">
      <div>
        <p className="text-sm font-semibold tracking-tight">
          {event.message || event.culprit || "Event"}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {event.timestamp}
          {event.level ? ` · ${event.level}` : ""}
          {event.platform ? ` · ${event.platform}` : ""}
        </p>
      </div>

      {highlights.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {highlights.map(([k, v]) => (
            <button
              key={`${k}-${v}`}
              type="button"
              className="rounded-md border border-border/60 bg-muted/30 px-2 py-1 font-mono text-[10px] hover:bg-muted/50"
              onClick={() => addFilter({ key: k, op: "eq", value: v })}
            >
              <span className="text-muted-foreground">{k}</span> {v}
            </button>
          ))}
        </div>
      ) : null}

      <CorrelationLinks
        projectId={projectId}
        context={context}
        eventId={event.event_id}
        traceId={event.trace_id}
        issueId={issueId}
      />

      <div className="flex flex-wrap gap-1 border-b border-border/60 pb-1">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded-md px-2 py-1 text-xs",
              tab === id
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "breadcrumbs" && breadcrumbs.length > 0
              ? ` ${breadcrumbs.length}`
              : ""}
          </button>
        ))}
      </div>

      {tab === "stack" ? (
        <ExceptionChainView
          exceptionJson={event.exception_json ?? ""}
          emptyMessage={
            event.message ||
            "No stack frames were captured for this event. Check SDK configuration and source maps/symbols."
          }
        />
      ) : null}

      {tab === "breadcrumbs" ? (
        <BreadcrumbsView
          items={breadcrumbs}
          emptyMessage="No breadcrumbs on this event."
        />
      ) : null}

      {tab === "tags" ? (
        <AttributeInspector
          attributes={tags}
          title="Tags"
          projectId={projectId}
          context={context}
          onAddFilter={addFilter}
        />
      ) : null}

      {tab === "context" ? (
        <div className="flex flex-col gap-3">
          {Object.keys(contexts).length === 0 ? (
            <p className="text-sm text-muted-foreground">No contexts</p>
          ) : (
            Object.entries(contexts).map(([name, val]) => (
              <AttributeInspector
                key={name}
                title={name}
                attributes={flattenContext(val)}
                projectId={projectId}
                context={context}
                onAddFilter={addFilter}
              />
            ))
          )}
        </div>
      ) : null}

      {tab === "json" ? (
        <pre
          className={cn(
            "overflow-auto rounded-lg border border-border/70 bg-muted/20 p-3 text-xs",
            compact ? "max-h-64" : "max-h-[60vh]",
          )}
        >
          {formatRawJson(event.raw_json)}
        </pre>
      ) : null}
    </div>
  )
}

function formatRawJson(raw?: string): string {
  if (!raw) return "No event payload"
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function flattenContext(
  val: unknown,
  prefix = "",
): Record<string, string> {
  if (val === null || val === undefined) return {}
  if (typeof val !== "object") {
    return { [prefix || "value"]: String(val) }
  }
  if (Array.isArray(val)) {
    return { [prefix || "value"]: JSON.stringify(val) }
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenContext(v, key))
    } else {
      out[key] = typeof v === "string" ? v : JSON.stringify(v)
    }
  }
  return out
}
