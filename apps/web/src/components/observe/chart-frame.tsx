import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

import { ObserveStatusBadge } from "./status-badge"
import type { QueryState } from "@/lib/observe/context"
import { cn } from "@/lib/utils"

/** Quiet panel chrome for charts and tables. */
export function ChartFrame({
  title,
  description,
  state = "idle",
  actions,
  children,
  className,
  hint,
  bucketLabel,
  scopeSummary,
  timezone,
  incompleteBucket,
  openExploreTo,
  openExploreSearch,
  onCreateAlert,
}: {
  title: string
  description?: string
  state?: QueryState
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  hint?: string
  bucketLabel?: string
  scopeSummary?: string
  timezone?: string
  incompleteBucket?: boolean
  openExploreTo?: string
  openExploreSearch?: Record<string, string | undefined>
  onCreateAlert?: () => void
}) {
  const loading = state === "loading"
  const meta = [bucketLabel, scopeSummary, timezone].filter(Boolean).join(" · ")
  return (
    <section className={cn("surface-panel overflow-hidden", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-xs font-medium text-foreground">
              {title}
            </h3>
            {state !== "idle" ? <ObserveStatusBadge state={state} /> : null}
            {loading ? (
              <Spinner className="size-3 text-muted-foreground" />
            ) : null}
          </div>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
          {meta ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{meta}</p>
          ) : null}
          {incompleteBucket ? (
            <p className="mt-0.5 text-[11px] text-warning">
              Current bucket may be incomplete.
            </p>
          ) : null}
          {hint ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {openExploreTo ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              render={
                <Link
                  to={openExploreTo as never}
                  search={openExploreSearch as never}
                />
              }
            >
              Open in Explore
            </Button>
          ) : null}
          {onCreateAlert ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={onCreateAlert}
            >
              Create alert
            </Button>
          ) : null}
          {actions}
        </div>
      </header>
      <div className={cn("relative px-4 py-3.5", loading && "min-h-[120px]")}>
        {loading && !children ? (
          <Skeleton className="h-28 w-full rounded-md" />
        ) : (
          <div className={cn(loading && "opacity-50 transition-opacity")}>
            {children}
          </div>
        )}
      </div>
    </section>
  )
}
