import type { LucideIcon } from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"

type StackCardProps = {
  title: string
  icon: LucideIcon
  status: string
  detail?: string
  selected?: boolean
  onClick?: () => void
}

export function StackCard({
  title,
  icon: Icon,
  status,
  detail,
  selected,
  onClick,
}: StackCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30",
        selected && "border-primary/50 bg-accent/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4" />
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {detail ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </div>
    </button>
  )
}
