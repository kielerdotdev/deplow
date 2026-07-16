import { InboxIcon, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function ObserveEmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-5 py-10",
        className,
      )}
    >
      <div className="icon-well size-9">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-sm font-semibold tracking-tight">{title}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
