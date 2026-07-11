import type { LucideIcon } from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"

type StackCardProps = {
  title: string
  icon: LucideIcon
  status: string
  detail: string
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
        "flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
        "hover:border-primary/40 hover:bg-accent/40",
        selected
          ? "border-primary/60 bg-accent/50 ring-1 ring-primary/30"
          : "border-border/80",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </button>
  )
}
