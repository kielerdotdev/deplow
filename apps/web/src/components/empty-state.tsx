import { ArrowRightIcon, type LucideIcon } from "lucide-react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

export type EmptyStateStep = {
  icon: LucideIcon
  label: string
  hint?: string
}

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  /** Secondary outline-style action (Railway dual-CTA pattern) */
  secondaryAction?: React.ReactNode
  steps?: EmptyStateStep[]
  /** Full-page empty areas vs table/panel insets */
  variant?: "default" | "compact"
  /** @deprecated Use `variant="compact"` */
  size?: "default" | "sm"
  align?: "center" | "start"
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  steps,
  variant,
  size = "default",
  align,
  className,
}: EmptyStateProps) {
  const resolvedVariant =
    variant ?? (size === "sm" ? "compact" : "default")
  const resolvedAlign = align ?? (resolvedVariant === "compact" ? "start" : "center")
  const isCentered = resolvedAlign === "center"

  return (
    <Empty
      className={cn(
        "relative border-0",
        isCentered ? "items-center text-center" : "items-start text-left",
        resolvedVariant === "default" ? "gap-4 px-6 py-16" : "gap-3.5 px-6 py-10",
        className,
      )}
    >
      <EmptyHeader
        className={cn(
          "w-full",
          isCentered ? "max-w-md items-center" : "max-w-lg items-start",
          resolvedVariant === "default" ? "gap-2" : "gap-1.5",
        )}
      >
        <EmptyMedia
          variant="icon"
          className={cn(
            "icon-well mb-0 border border-dashed border-border bg-muted/60 text-muted-foreground",
            resolvedVariant === "default"
              ? "size-12 rounded-sm [&_svg]:size-5"
              : "size-10 rounded-sm [&_svg]:size-4",
          )}
        >
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-semibold tracking-tight">
          {title}
        </EmptyTitle>
        <EmptyDescription className="text-sm text-muted-foreground">
          {description}
        </EmptyDescription>
      </EmptyHeader>

      {action || secondaryAction ? (
        <EmptyContent
          className={cn(
            "mt-0.5 gap-2",
            isCentered ? "max-w-xs items-center" : "max-w-none items-start",
            !isCentered && "sm:flex-row",
          )}
        >
          {action}
          {secondaryAction}
        </EmptyContent>
      ) : null}

      {steps && steps.length > 0 ? (
        <div
          className={cn(
            "surface-inset w-full px-4 py-3",
            isCentered ? "max-w-lg" : "max-w-none",
          )}
        >
          <ol className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-2">
            {steps.map((step, index) => {
              const StepIcon = step.icon
              return (
                <li
                  key={step.label}
                  className="flex min-w-0 items-center gap-2 sm:contents"
                >
                  {index > 0 ? (
                    <ArrowRightIcon
                      aria-hidden
                      className="hidden size-3.5 shrink-0 text-muted-foreground/50 sm:block"
                    />
                  ) : null}
                  <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:flex-initial">
                    <div className="icon-well size-7 shrink-0">
                      <StepIcon className="size-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {step.label}
                      </p>
                      {step.hint ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {step.hint}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      ) : null}
    </Empty>
  )
}
