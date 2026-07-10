import type { LucideIcon } from "lucide-react"
import {
  DatabaseBackupIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  RocketIcon,
  ScrollTextIcon,
  Settings2Icon,
} from "lucide-react"

import { cn } from "@/lib/utils"

export type ProjectSection =
  | "overview"
  | "deployments"
  | "logs"
  | "settings"
  | "secrets"
  | "backups"

const items: {
  id: ProjectSection
  label: string
  icon: LucideIcon
}[] = [
  { id: "overview", label: "Overview", icon: LayoutGridIcon },
  { id: "deployments", label: "Deployments", icon: RocketIcon },
  { id: "logs", label: "Logs", icon: ScrollTextIcon },
  { id: "settings", label: "Settings", icon: Settings2Icon },
  { id: "secrets", label: "Secrets", icon: KeyRoundIcon },
  { id: "backups", label: "Backups", icon: DatabaseBackupIcon },
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
        "flex shrink-0 gap-1 overflow-x-auto rounded-xl border border-border/80 bg-card/50 p-1 sm:flex-col sm:overflow-visible",
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
              "inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
              active
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            <span className="sr-only">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
