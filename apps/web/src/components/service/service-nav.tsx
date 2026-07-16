import { cn } from "@/lib/utils"

export type ServiceTab =
  | "overview"
  | "deployments"
  | "database"
  | "backups"
  | "settings"

export function ServiceNav({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: ServiceTab; label: string }>
  active: ServiceTab
  onChange: (tab: ServiceTab) => void
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border pb-px">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "px-3 py-2 text-sm",
            active === t.id
              ? "border-b-2 border-foreground font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
