import {
  AlertTriangleIcon,
  ClockIcon,
  InboxIcon,
  Loader2Icon,
  SearchXIcon,
  type LucideIcon,
} from "lucide-react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

export type EmptyVariant =
  | "empty"
  | "no_match"
  | "outside_range"
  | "loading"
  | "error"
  | "no_unresolved"

const VARIANT_DEFAULTS: Record<
  EmptyVariant,
  { icon: LucideIcon; title: string; description: string }
> = {
  empty: {
    icon: InboxIcon,
    title: "No telemetry yet",
    description: "Send spans, logs, or errors to see data here.",
  },
  no_match: {
    icon: SearchXIcon,
    title: "No results match these filters",
    description: "Try widening the time range or clearing filters.",
  },
  outside_range: {
    icon: ClockIcon,
    title: "No data in this time range",
    description: "Telemetry may exist outside the selected period.",
  },
  loading: {
    icon: Loader2Icon,
    title: "Loading",
    description: "Fetching results…",
  },
  error: {
    icon: AlertTriangleIcon,
    title: "Query failed",
    description: "Something went wrong loading this data. Try again.",
  },
  no_unresolved: {
    icon: InboxIcon,
    title: "No unresolved issues",
    description:
      "No grouped errors were found for the selected time range and filters.",
  },
}

/**
 * Integrated empty / loading / error state for Observe pages.
 * Aligns to the page content grid — not a floating modal card.
 */
export function ObserveEmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  variant = "empty",
}: {
  icon?: LucideIcon
  title?: string
  description?: string
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  className?: string
  variant?: EmptyVariant
}) {
  const defaults = VARIANT_DEFAULTS[variant]
  const Icon = icon ?? defaults.icon
  return (
    <Empty
      className={cn(
        "items-start justify-start border-0 bg-transparent px-0 py-10 text-left sm:py-12",
        className,
      )}
      data-testid="observe-empty-state"
      data-variant={variant}
    >
      <EmptyHeader className="max-w-lg items-start gap-3">
        <EmptyMedia
          variant="icon"
          className="icon-well mb-0 size-10 rounded-sm border border-border bg-muted/50"
        >
          <Icon
            className={cn(
              "size-4",
              variant === "loading" && "animate-spin",
              variant === "error" && "text-destructive",
            )}
          />
        </EmptyMedia>
        <EmptyTitle className="text-base font-semibold tracking-tight text-foreground">
          {title ?? defaults.title}
        </EmptyTitle>
        <EmptyDescription className="text-sm leading-relaxed text-muted-foreground">
          {description ?? defaults.description}
        </EmptyDescription>
      </EmptyHeader>
      {action || secondaryAction ? (
        <EmptyContent className="mt-1 flex flex-wrap items-start gap-2 sm:flex-row">
          {action}
          {secondaryAction}
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
