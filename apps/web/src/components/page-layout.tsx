import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type PageHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-4",
        className,
      )}
    >
      <div className="flex flex-col min-w-0 gap-0.5">
        <h1 className="flex flex-wrap items-center gap-2 text-balance text-xl font-semibold tracking-[-0.035em] text-foreground md:text-[1.375rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-pretty text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  )
}

type PageContentProps = {
  children: React.ReactNode
  /** narrow: forms/settings (max-w-3xl); wide: tables/dashboards (full width) */
  width?: "narrow" | "wide"
  className?: string
}

export function PageContent({
  children,
  width = "wide",
  className,
}: PageContentProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3.5",
        width === "narrow" && "max-w-3xl",
        className,
      )}
    >
      {children}
    </div>
  )
}

type SettingsPanelProps = {
  title: string
  description?: React.ReactNode
  icon?: LucideIcon
  action?: React.ReactNode
  footer?: React.ReactNode
  /** Tables and lists: no inner horizontal padding */
  flush?: boolean
  children: React.ReactNode
  className?: string
}

export function SettingsPanel({
  title,
  description,
  icon: Icon,
  action,
  footer,
  flush = false,
  children,
  className,
}: SettingsPanelProps) {
  return (
    <section className={cn("surface-panel overflow-hidden", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="icon-well mt-0.5 size-7 shrink-0">
              <Icon className="size-3.5" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn(flush ? "py-0" : "px-4 py-3.5")}>{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5">
          {footer}
        </div>
      ) : null}
    </section>
  )
}
