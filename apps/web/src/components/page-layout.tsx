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
        "flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
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
  /**
   * narrow: settings form column (~780px)
   * wide: shared page-container width
   */
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
        "flex w-full flex-col gap-4",
        /* AppShell already applies .page-container; narrow further constrains forms. */
        width === "narrow" && "max-w-[780px]",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Two-column settings layout: local nav + content. */
export function SettingsShell({
  nav,
  children,
  className,
}: {
  nav: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex w-full max-w-[1280px] flex-col gap-8 lg:flex-row lg:items-start lg:gap-10",
        className,
      )}
    >
      {nav}
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </div>
  )
}

/**
 * Standard settings page stack: title → description → body.
 * Use this instead of bare PageHeader + PageContent fragments.
 */
export function SettingsPage({
  title,
  description,
  actions,
  children,
  width = "narrow",
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  width?: "narrow" | "wide"
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-6",
        width === "narrow" && "max-w-[780px]",
        className,
      )}
    >
      <PageHeader title={title} description={description} actions={actions} />
      <div className="flex flex-col gap-4">{children}</div>
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
    <section
      className={cn(
        "surface-panel overflow-hidden",
        flush &&
          "[&_[data-slot=table-cell]]:px-5 [&_[data-slot=table-head]]:h-11 [&_[data-slot=table-head]]:px-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="icon-well mt-0.5 size-7 shrink-0">
              <Icon className="size-3.5" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn(flush ? "py-0" : "px-5 py-4")}>{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  )
}
