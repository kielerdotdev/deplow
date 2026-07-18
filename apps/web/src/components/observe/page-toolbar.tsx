import { cn } from "@/lib/utils"

/**
 * Horizontal toolbar row for Observe investigation surfaces.
 * Keeps control heights and wrap behavior consistent.
 */
export function PageToolbar({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode
  className?: string
  "aria-label"?: string
}) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      data-testid="page-toolbar"
      className={cn(
        "flex flex-wrap items-center gap-2",
        "[&_[data-slot=input-group]]:min-h-8 [&_[data-slot=input-group]]:h-8",
        "[&_button]:min-h-8",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Groups secondary toolbar actions (saved views, bulk actions). */
export function PageToolbarActions({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "ml-auto flex flex-wrap items-center justify-end gap-2",
        className,
      )}
    >
      {children}
    </div>
  )
}
