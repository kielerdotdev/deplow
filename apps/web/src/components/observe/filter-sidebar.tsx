import type { ReactNode } from "react"

import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export function FilterSidebarFrame({
  children,
  waiting = false,
  className,
}: {
  children: ReactNode
  waiting?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col",
        waiting && "opacity-60",
        className,
      )}
      data-testid="filter-sidebar-frame"
    >
      {children}
    </div>
  )
}

export function FilterSidebarHeader({
  title = "Filters",
  canClear = false,
  onClear,
}: {
  title?: string
  canClear?: boolean
  onClear?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground/70">
        {title}
      </h3>
      {canClear && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear all
        </button>
      ) : null}
    </div>
  )
}

export function FilterSidebarBody({ children }: { children: ReactNode }) {
  return (
    <>
      <Separator className="my-2" />
      <div className="relative min-h-0 flex-1">
        <ScrollArea className="h-full max-h-[min(70vh,40rem)]">
          <div className="space-y-1 pr-2 pb-6">{children}</div>
        </ScrollArea>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent"
        />
      </div>
    </>
  )
}

export function FilterSidebarLoading({
  sectionCount = 3,
}: {
  sectionCount?: number
}) {
  return (
    <FilterSidebarFrame>
      <div className="flex items-center justify-between py-2">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
      </div>
      <Separator className="my-2" />
      <div className="space-y-4">
        {Array.from({ length: sectionCount }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </FilterSidebarFrame>
  )
}

export function FilterSidebarError({
  message = "Failed to load filters",
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <FilterSidebarFrame>
      <FilterSidebarHeader />
      <Separator className="my-2" />
      <div className="space-y-2 py-2">
        <p className="text-xs text-muted-foreground">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs text-foreground underline-offset-2 hover:underline"
          >
            Retry
          </button>
        ) : null}
      </div>
    </FilterSidebarFrame>
  )
}
