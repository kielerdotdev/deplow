import { Link } from "@tanstack/react-router"
import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  serializeContext,
  serializeIssueSearch,
  serializeTraceSearch,
  type ObserveContext,
} from "@/lib/observe/context"
import { missingCopy } from "@/lib/observe/missing"
import { cn } from "@/lib/utils"

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function CopyIdButton({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn("h-7 gap-1.5 px-2 font-mono text-xs", className)}
      onClick={() => {
        void copyText(value).then((ok) => {
          if (!ok) return
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-success" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      {label}
    </Button>
  )
}

export function CorrelationLinks({
  projectId,
  context,
  eventId,
  traceId,
  spanId,
  issueId,
  aroundMs,
  className,
}: {
  projectId: string
  context: ObserveContext
  eventId?: string | null
  traceId?: string | null
  spanId?: string | null
  issueId?: string | null
  /** Epoch ms — enables “logs around event” ±5m pivot. */
  aroundMs?: number | null
  className?: string
}) {
  const hasTrace = Boolean(traceId)
  const hasSpan = Boolean(spanId)
  const hasIssue = Boolean(issueId)

  const aroundSearch =
    aroundMs != null && Number.isFinite(aroundMs)
      ? serializeContext({
          ...context,
          time: {
            kind: "absolute",
            from: new Date(aroundMs - 5 * 60_000).toISOString(),
            to: new Date(aroundMs + 5 * 60_000).toISOString(),
          },
          query: {
            ...context.query,
            ...(traceId ? { traceId } : {}),
            ...(spanId ? { spanId } : {}),
          },
        })
      : null

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-testid="correlation-links"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {hasTrace ? (
          <Button
            size="sm"
            variant="outline"
            render={
              <Link
                to="/observe/projects/$projectId/traces/$traceId"
                params={{ projectId, traceId: traceId! }}
                search={serializeTraceSearch(context, spanId)}
              />
            }
          >
            Open trace
          </Button>
        ) : null}
        {hasTrace ? (
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
                    traceId: traceId!,
                    ...(spanId ? { spanId } : {}),
                  },
                })}
              />
            }
          >
            Correlated logs
          </Button>
        ) : null}
        {aroundSearch ? (
          <Button
            size="sm"
            variant="outline"
            render={
              <Link
                to="/observe/projects/$projectId/logs"
                params={{ projectId }}
                search={aroundSearch}
              />
            }
          >
            Logs ±5m
          </Button>
        ) : null}
        {hasIssue ? (
          <Button
            size="sm"
            variant="outline"
            render={
              <Link
                to="/observe/projects/$projectId/issues/$issueId"
                params={{ projectId, issueId: issueId! }}
                search={serializeIssueSearch(context)}
              />
            }
          >
            Related issue
          </Button>
        ) : null}
        {eventId ? <CopyIdButton label="Event ID" value={eventId} /> : null}
        {hasTrace ? <CopyIdButton label="Trace ID" value={traceId!} /> : null}
        {hasSpan ? <CopyIdButton label="Span ID" value={spanId!} /> : null}
      </div>
      {!hasTrace ? (
        <p className="text-[11px] text-muted-foreground">
          {missingCopy("no_trace").detail}
        </p>
      ) : null}
    </div>
  )
}
