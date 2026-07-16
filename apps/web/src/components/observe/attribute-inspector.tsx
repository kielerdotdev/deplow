import { Link } from "@tanstack/react-router"
import { CheckIcon, CopyIcon, FilterIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  serializeContext,
  serializeTraceSearch,
  type FilterClause,
  type ObserveContext,
} from "@/lib/observe/context"
import { cn } from "@/lib/utils"

const TRACE_KEYS = new Set([
  "trace_id",
  "trace.id",
  "traceId",
  "otel.trace_id",
])
const SPAN_KEYS = new Set([
  "span_id",
  "span.id",
  "spanId",
  "otel.span_id",
  "parent_span_id",
])

function looksLikeTraceId(value: string): boolean {
  return /^[0-9a-f]{16,32}$/i.test(value.trim())
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function AttributeInspector({
  attributes,
  title = "Attributes",
  projectId,
  context,
  onAddFilter,
  className,
}: {
  attributes: Record<string, string | number | boolean | null | undefined>
  title?: string
  projectId?: string
  context?: ObserveContext
  onAddFilter?: (clause: FilterClause) => void
  className?: string
}) {
  const entries = Object.entries(attributes).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  )
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No attributes</p>
  }

  return (
    <div className={cn("surface-inset overflow-hidden", className)}>
      <h4 className="border-b border-border/50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <dl className="divide-y divide-border/40">
        {entries.map(([k, v]) => (
          <AttributeRow
            key={k}
            attrKey={k}
            value={String(v)}
            projectId={projectId}
            context={context}
            onAddFilter={onAddFilter}
          />
        ))}
      </dl>
    </div>
  )
}

function AttributeRow({
  attrKey,
  value,
  projectId,
  context,
  onAddFilter,
}: {
  attrKey: string
  value: string
  projectId?: string
  context?: ObserveContext
  onAddFilter?: (clause: FilterClause) => void
}) {
  const [copied, setCopied] = useState(false)
  const isTrace =
    TRACE_KEYS.has(attrKey) ||
    (attrKey.toLowerCase().includes("trace") && looksLikeTraceId(value))
  const isSpan = SPAN_KEYS.has(attrKey)
  const canFilter = Boolean(onAddFilter)
  const canOpenLogs = Boolean(projectId && context && (isTrace || isSpan))

  return (
    <div className="group flex items-start gap-2 px-3 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <dt className="truncate font-mono text-muted-foreground">{attrKey}</dt>
        <dd className="mt-0.5 break-all font-mono">{value}</dd>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-7"
          title="Copy value"
          aria-label="Copy value"
          onClick={() => {
            void copyText(value).then((ok) => {
              if (!ok) return
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1200)
            })
          }}
        >
          {copied ? (
            <CheckIcon className="size-3.5 text-success" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </Button>
        {canFilter ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="size-7"
            title="Add filter"
            aria-label={`Filter by ${attrKey}`}
            onClick={() =>
              onAddFilter?.({ key: attrKey, op: "eq", value })
            }
          >
            <FilterIcon className="size-3.5" />
          </Button>
        ) : null}
        {canOpenLogs && isTrace ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            render={
              <Link
                to="/observe/projects/$projectId/logs"
                params={{ projectId: projectId! }}
                search={serializeContext({
                  ...context!,
                  query: { ...context!.query, traceId: value },
                })}
              />
            }
          >
            Logs
          </Button>
        ) : null}
        {canOpenLogs && isTrace ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            render={
              <Link
                to="/observe/projects/$projectId/traces/$traceId"
                params={{ projectId: projectId!, traceId: value }}
                search={serializeTraceSearch(context!)}
              />
            }
          >
            Trace
          </Button>
        ) : null}
        {canOpenLogs && isSpan && context?.query.traceId ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            render={
              <Link
                to="/observe/projects/$projectId/logs"
                params={{ projectId: projectId! }}
                search={serializeContext({
                  ...context,
                  query: {
                    ...context.query,
                    spanId: value,
                  },
                })}
              />
            }
          >
            Logs
          </Button>
        ) : null}
      </div>
    </div>
  )
}
