import { cn } from "@/lib/utils"
import type { QueryState } from "@/lib/observe/context"

const labels: Record<QueryState, string> = {
  idle: "Idle",
  loading: "Loading",
  streaming: "Streaming",
  empty: "No data",
  partial: "Partial",
  sampled: "Sampled",
  stale: "Stale",
  error: "Error",
}

const styles: Record<QueryState, string> = {
  idle: "bg-muted text-muted-foreground",
  loading: "bg-info/15 text-info",
  streaming: "bg-info/15 text-info animate-pulse",
  empty: "bg-muted text-muted-foreground",
  partial: "bg-warning/15 text-warning",
  sampled: "bg-warning/15 text-warning",
  stale: "bg-muted text-muted-foreground",
  error: "bg-destructive/15 text-destructive",
}

export function ObserveStatusBadge({
  state,
  className,
}: {
  state: QueryState
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        styles[state],
        className,
      )}
    >
      {labels[state]}
    </span>
  )
}
