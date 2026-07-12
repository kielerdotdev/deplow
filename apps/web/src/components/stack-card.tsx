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
        "surface-panel flex flex-col gap-3 p-4 text-left transition-[box-shadow,background-color] duration-150 ease-out-ui hover:ring-primary/25",
        selected ? "ring-primary/40 bg-accent/30" : "",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="icon-well size-8">
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
