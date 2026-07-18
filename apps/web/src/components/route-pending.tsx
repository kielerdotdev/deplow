import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/**
 * Pending UI that preserves nested Atlasflow chrome so authenticated
 * navigations don't flash a bare content skeleton.
 */
export function ShellPending({ className }: { className?: string }) {
  return (
    <div
      className={cn("app-shell select-none", className)}
      data-testid="shell-pending"
      role="status"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-sm" />
          <span className="app-crumb-sep">/</span>
          <Skeleton className="h-8 w-28 rounded-sm" />
          <span className="app-crumb-sep">/</span>
          <Skeleton className="h-8 w-32 rounded-sm" />
        </div>
        <Skeleton className="size-8 rounded-full" />
      </div>
      <div className="flex h-12 shrink-0 items-center gap-2 px-2">
        <Skeleton className="h-8 w-24 rounded-sm" />
        <Skeleton className="h-8 w-28 rounded-sm" />
        <Skeleton className="h-8 w-20 rounded-sm" />
        <Skeleton className="h-8 w-24 rounded-sm" />
      </div>
      <div className="app-shell-panel">
        <div className="flex h-12 items-center border-b border-border px-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <RoutePending className="flex-1 p-0" />
      </div>
    </div>
  )
}

/** Default route pending UI — content skeleton without assuming a shell. */
export function RoutePending({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-0",
        className,
      )}
      data-testid="route-pending"
      role="status"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        <span>Loading…</span>
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex h-12 items-center gap-3 border-b border-border/60 px-4"
        >
          <Skeleton className="size-2 rounded-full" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Compact inline pending block for panels / drawers. */
export function InlinePending({
  label = "Loading…",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-6 text-sm text-muted-foreground",
        className,
      )}
      role="status"
      aria-busy="true"
    >
      <Spinner className="size-4" />
      <span>{label}</span>
    </div>
  )
}

/** Table-shaped skeleton used by DataTable while querying. */
export function TablePending({
  rows = 6,
  columns = 4,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div
      className={cn("flex flex-col gap-0 px-4 py-3", className)}
      role="status"
      aria-busy="true"
      aria-label="Loading table"
      data-testid="table-pending"
    >
      <div className="mb-3 flex gap-4 border-b border-border/50 pb-2">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={`h-${i}`}
            className={cn("h-3", i === 0 ? "w-32" : "w-20")}
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-border/30 py-3">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn(
                "h-3.5",
                c === 0 ? "w-40" : c === columns - 1 ? "w-16" : "w-24",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
