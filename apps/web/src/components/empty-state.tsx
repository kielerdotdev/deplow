import type { LucideIcon } from "lucide-react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
    <Empty
      className={cn(
        "relative border-0",
        size === "default" ? "gap-5 px-6 py-20" : "gap-3 px-4 py-12",
        className,
      )}
    >
      <EmptyHeader
        className={cn(
          "max-w-md",
          size === "default" ? "gap-2" : "gap-1.5",
        )}
      >
        <EmptyMedia
          variant="icon"
          className={cn(
            "icon-well mb-0 border border-dashed border-border bg-muted/60 text-muted-foreground",
            size === "default" ? "size-16 rounded-lg [&_svg]:size-7" : "size-12 [&_svg]:size-5",
          )}
        >
          <Icon />
        </EmptyMedia>
        <EmptyTitle
          className={cn(
            "font-semibold tracking-tight",
            size === "default" ? "text-lg" : "text-sm",
          )}
        >
          {title}
        </EmptyTitle>
        <EmptyDescription className="text-balance leading-relaxed">
          {description}
        </EmptyDescription>
      </EmptyHeader>
      {action || secondaryAction ? (
        <EmptyContent className="mt-1 max-w-xs gap-2">
          {action}
          {secondaryAction}
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
