import type { LucideIcon } from "lucide-react"
import {
  KeyRoundIcon,
  LayoutGridIcon,
  RocketIcon,
  Settings2Icon,
} from "lucide-react"

import { cn } from "@/lib/utils"

export type ProjectSection =
  | "overview"
  | "deployments"
  | "settings"
  | "secrets"

const items: {
  id: ProjectSection
  label: string
  icon: LucideIcon
}[] = [
  { id: "overview", label: "Overview", icon: LayoutGridIcon },
  { id: "deployments", label: "Deployments", icon: RocketIcon },
  { id: "settings", label: "Settings", icon: Settings2Icon },
  { id: "secrets", label: "Secrets", icon: KeyRoundIcon },
]

type ProjectRailProps = {
  value: ProjectSection
  onChange: (section: ProjectSection) => void
  className?: string
}

export function ProjectRail({ value, onChange, className }: ProjectRailProps) {
  return (
    <nav
      className={cn(
        "flex shrink-0 gap-0.5 overflow-x-auto rounded-xl border border-border/50 bg-card p-1 sm:w-44 sm:flex-col sm:overflow-visible",
        className,
      )}
      aria-label="Project sections"
    >
      {items.map((item) => {
        const active = value === item.id
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            onClick={() => onChange(item.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-w-0 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <item.icon className="size-3.5 shrink-0 opacity-70" />
            <span className="truncate">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
