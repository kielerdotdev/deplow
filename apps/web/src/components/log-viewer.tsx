import { useEffect, useRef, type ReactNode } from "react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type LogViewerProps = {
  title?: string
  body: string
  live?: boolean
  loading?: boolean
  empty?: string
  className?: string
  heightClassName?: string
  actions?: ReactNode
}

/**
 * Shared log surface: auto-scrolls as `body` grows, shows a live pulse when
 * following an in-progress stream.
 */
export function LogViewer({
  title,
  body,
  live = false,
  loading = false,
  empty = "(no output)",
  className,
  heightClassName = "h-96",
  actions,
}: LogViewerProps) {
  const endRef = useRef<HTMLPreElement>(null)
  const stickToBottom = useRef(true)
  const display = body.trim() ? body : loading ? "Loading…" : empty

  useEffect(() => {
    if (!stickToBottom.current) return
    endRef.current?.scrollIntoView({ block: "end" })
  }, [display])

  return (
    <div className={cn("space-y-3", className)}>
      {title || live || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {title ? (
              <p className="truncate text-sm font-medium">{title}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {live ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                Live
              </span>
            ) : null}
            {actions}
          </div>
        </div>
      ) : null}
      <ScrollArea
        className={cn(
          "rounded-lg border border-border bg-muted/20",
          heightClassName,
        )}
        onScrollCapture={(event) => {
          const root = event.currentTarget.querySelector(
            "[data-slot=scroll-area-viewport]",
          ) as HTMLElement | null
          if (!root) return
          const distance =
            root.scrollHeight - root.scrollTop - root.clientHeight
          stickToBottom.current = distance < 48
        }}
      >
        <pre
          ref={endRef}
          className="p-4 font-mono text-xs whitespace-pre-wrap"
        >
          {display}
        </pre>
      </ScrollArea>
    </div>
  )
}
