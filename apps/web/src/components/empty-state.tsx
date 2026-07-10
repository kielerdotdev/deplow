import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type EmptyStateProps = {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  size?: "sm" | "md"
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = "md",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center",
        size === "sm" ? "px-4 py-8" : "px-6 py-12",
        className,
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "text-muted-foreground",
            size === "sm" ? "size-6" : "size-8",
          )}
        />
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  )
}
