import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  /** Secondary outline-style action (Railway dual-CTA pattern) */
  secondaryAction?: React.ReactNode
  className?: string
  size?: "default" | "sm"
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "default",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "default" ? "gap-4 px-6 py-16" : "gap-3 px-4 py-10",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/30 text-muted-foreground",
          size === "default" ? "size-14" : "size-11",
        )}
      >
        <Icon className={size === "default" ? "size-6" : "size-5"} />
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <p
          className={cn(
            "font-medium tracking-tight",
            size === "default" ? "text-base" : "text-sm",
          )}
        >
          {title}
        </p>
        <p className="text-sm text-muted-foreground text-balance leading-relaxed">
          {description}
        </p>
      </div>
      {action || secondaryAction ? (
        <div className="mt-1 flex w-full max-w-xs flex-col gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  )
}
