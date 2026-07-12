import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** Railway-style settings block: left rail icon + titled content. */
export function SettingsSection({
  icon: Icon,
  title,
  action,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("surface-panel flex gap-4 p-4 md:p-5", className)}>
      <div className="hidden shrink-0 sm:block">
        <div className="icon-well size-9">
          <Icon className="size-4" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {children}
      </div>
    </section>
  )
}

export function SettingsField({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{label}</p>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  )
}

/** Connected resource chip: icon + label + trailing actions. */
export function ConnectionChip({
  icon: Icon,
  label,
  sublabel,
  actions,
  className,
}: {
  icon?: LucideIcon
  label: React.ReactNode
  sublabel?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/30",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <Icon className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{label}</div>
          {sublabel ? (
            <div className="truncate text-xs text-muted-foreground">
              {sublabel}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

/** Full-width status row with optional toggle-like trailing control. */
export function SettingsStatusRow({
  icon: Icon,
  title,
  description,
  trailing,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-card px-3 py-2.5",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? (
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {trailing}
    </div>
  )
}

export function SettingsGroupLabel({
  children,
}: {
  children: React.ReactNode
}) {
  return <p className="text-sm font-medium text-foreground/90">{children}</p>
}

export function SettingsHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
  )
}
