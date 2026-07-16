import { ObserveStatusBadge } from "./status-badge"
import type { QueryState } from "@/lib/observe/context"
import { cn } from "@/lib/utils"

/** Matches Deploy SettingsPanel / DashboardCard surface language. */
export function ChartFrame({
  title,
  description,
  state = "idle",
  actions,
  children,
  className,
  hint,
}: {
  title: string
  description?: string
  state?: QueryState
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** e.g. "Drag to zoom · Click a point to dig in" */
  hint?: string
}) {
  return (
    <section className={cn("surface-panel overflow-hidden", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold tracking-tight">
              {title}
            </h3>
            {state !== "idle" ? <ObserveStatusBadge state={state} /> : null}
          </div>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
          {hint ? (
            <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}
