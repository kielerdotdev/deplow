import { cn } from "@/lib/utils"

/**
 * Shared list chrome for Saved charts / Boards / Alerts.
 * Flush card + dense rows so library pages feel like one product surface.
 */
export function ResourceTable({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "surface-panel rounded-lg",
        className,
      )}
      data-testid="resource-table"
    >
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  )
}

export function ResourceTableHead({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <thead>
      <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
        {children}
      </tr>
    </thead>
  )
}

export function ResourceTh({
  children,
  className,
  srOnly,
}: {
  children?: React.ReactNode
  className?: string
  srOnly?: boolean
}) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 font-medium",
        srOnly && "sr-only",
        className,
      )}
    >
      {children}
    </th>
  )
}

export function ResourceTableBody({
  children,
}: {
  children: React.ReactNode
}) {
  return <tbody className="divide-y divide-border/60">{children}</tbody>
}

export function ResourceRow({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <tr
      className={cn(
        "transition-colors duration-150",
        onClick
          ? "cursor-pointer hover:bg-foreground/[0.04]"
          : "hover:bg-muted/25",
        className,
      )}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
    >
      {children}
    </tr>
  )
}

export function ResourceTd({
  children,
  className,
  stopPropagation,
}: {
  children: React.ReactNode
  className?: string
  /** Wrap action buttons so row click does not fire. */
  stopPropagation?: boolean
}) {
  return (
    <td
      className={cn("px-3 py-3 align-middle", className)}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {children}
    </td>
  )
}
