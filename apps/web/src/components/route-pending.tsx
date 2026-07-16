import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/**
 * Pending UI that preserves a sidebar-shaped chrome outline so authenticated
 * navigations don't flash a bare content skeleton.
 */
export function ShellPending({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex min-h-svh w-full bg-background", className)}
      data-testid="shell-pending"
      role="status"
      aria-busy="true"
      aria-label="Loading page"
    >
      <aside className="hidden w-56 shrink-0 border-r border-border bg-sidebar p-3 md:block">
        <Skeleton className="mb-3 h-9 w-full" />
        <Skeleton className="mb-2 h-7 w-full" />
        <Skeleton className="mb-6 h-7 w-3/4" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-5/6" />
          <Skeleton className="h-8 w-full" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-border px-4">
          <Skeleton className="size-7" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-40" />
        </div>
        <RoutePending className="flex-1" />
      </div>
    </div>
  )
}

/** Default route pending UI — content skeleton without assuming a shell. */
export function RoutePending({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:px-6 md:py-8",
        className,
      )}
      data-testid="route-pending"
      role="status"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        <span>Loading…</span>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
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
        "flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground",
        className,
      )}
      role="status"
      aria-busy="true"
    >
      <Spinner className="size-3.5" />
      {label}
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
      className={cn("flex flex-col gap-0 px-5 py-3", className)}
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
