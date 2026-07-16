import {
  AlertTriangleIcon,
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
    icon: SearchXIcon,
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
}

export function ObserveEmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = "empty",
}: {
  icon?: LucideIcon
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
  variant?: EmptyVariant
}) {
  const defaults = VARIANT_DEFAULTS[variant]
  const Icon = icon ?? defaults.icon
  return (
    <Empty
      className={cn(
        "items-start border border-dashed border-border bg-muted/15 px-4 py-8 text-left",
        className,
      )}
      data-testid="observe-empty-state"
      data-variant={variant}
    >
      <EmptyHeader className="max-w-md items-start gap-3">
        <EmptyMedia
          variant="icon"
          className="icon-well mb-0 size-9 rounded-md border border-dashed border-border bg-muted/60"
        >
          <Icon className={cn(variant === "loading" && "animate-spin")} />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-semibold tracking-tight">
          {title ?? defaults.title}
        </EmptyTitle>
        <EmptyDescription className="text-sm text-muted-foreground">
          {description ?? defaults.description}
        </EmptyDescription>
      </EmptyHeader>
      {action ? (
        <EmptyContent className="mt-0 items-start">{action}</EmptyContent>
      ) : null}
    </Empty>
  )
}
