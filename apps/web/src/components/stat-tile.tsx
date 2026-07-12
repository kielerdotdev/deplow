import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type StatTileProps = {
  label: string
  value: string | number
  hint?: string
  icon?: LucideIcon
  className?: string
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "surface-panel group flex flex-col gap-3 p-4 transition-colors hover:bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <div className="icon-well size-8 opacity-80 transition-opacity group-hover:opacity-100">
            <Icon className="size-3.5" />
          </div>
        ) : null}
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {hint ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  )
}
