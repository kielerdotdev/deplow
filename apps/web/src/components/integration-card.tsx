import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type IntegrationCardProps = {
  title: string
  icon: LucideIcon
  /** Short status line under the title, e.g. "Connected as @user" */
  detail: string
  connected?: boolean
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

export function IntegrationCard({
  title,
  icon: Icon,
  detail,
  connected,
  actions,
  children,
  className,
}: IntegrationCardProps) {
  return (
    <article className={cn("surface-panel flex flex-col gap-4 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="icon-well size-10 shrink-0">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  connected ? "bg-success" : "bg-muted-foreground/40",
                )}
                aria-hidden
              />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {detail}
            </p>
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </article>
  )
}
