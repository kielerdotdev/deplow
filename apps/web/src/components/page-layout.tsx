import type { LucideIcon } from "lucide-react"

import { SoftHit } from "@/components/soft-hit"
import { cn } from "@/lib/utils"

type PageHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

/** Atlasflow panel header: 48px bar, title + muted description + actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 min-w-0 items-center justify-between gap-2 overflow-hidden border-b border-border px-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden text-[14px] font-medium text-muted-foreground">
        <span className="shrink-0 text-foreground">{title}</span>
        {description ? (
          <span className="hidden min-w-0 truncate text-shell-faint sm:inline">
            {description}
          </span>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </header>
  )
}

/** Solid soft-hit button for panel headers (Create deployment, etc.). */
export function PanelActionButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <SoftHit
      as="button"
      tone="solid"
      onClick={onClick}
      disabled={disabled}
      className={cn("shrink-0", className)}
    >
      <span className="flex h-8 items-center px-2.5 text-[13px] font-medium text-foreground/80">
        {children}
      </span>
    </SoftHit>
  )
}

type PageContentProps = {
  children: React.ReactNode
  /**
   * Width is relative to the shell frame (max-w-7xl, owned by AppShell).
   * narrow: settings form column (~780px)
   * wide: default detail pages — padded body
   * flush: dense lists within the shell frame (no extra inset)
   */
  width?: "narrow" | "wide" | "flush"
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
        // Natural height so AppShell's panel-scroll owns page scrolling.
        "flex w-full flex-col",
        // Cap width; stay start-aligned in the shell frame (never float mid-ultrawide).
        width === "narrow" && "max-w-[780px] gap-4 p-4 sm:px-6",
        width === "wide" && "gap-5 p-4 sm:gap-6 sm:px-6 sm:py-5",
        width === "flush" && "gap-0 p-0",
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
        // min-h-full fills short settings pages; height stays content-sized
        // so the shell panel (not this split) scrolls long pages.
        "flex min-h-full w-full flex-col md:flex-row",
        className,
      )}
    >
      <aside className="w-full shrink-0 border-b border-border md:w-52 md:border-r md:border-b-0">
        {nav}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

/**
 * Standard settings page stack: chrome title → padded body.
 * Long copy goes under the bar (never truncated in the 48px header).
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
    <div className={cn("flex w-full flex-col", className)}>
      <PageHeader title={title} actions={actions} />
      <div
        className={cn(
          "flex flex-col gap-4 p-4 sm:px-6",
          width === "narrow" && "max-w-[780px]",
        )}
      >
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        {children}
      </div>
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
      <div className="flex flex-col gap-1 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon ? (
              <Icon className="size-4 shrink-0 text-muted-foreground" />
            ) : null}
            <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {description ? (
          <p className="max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className={cn(flush ? "py-0" : "px-4 py-4")}>{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  )
}
