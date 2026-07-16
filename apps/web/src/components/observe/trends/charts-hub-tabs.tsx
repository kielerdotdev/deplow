import { Link } from "@tanstack/react-router"

import { cn } from "@/lib/utils"

export type ChartsView = "builder" | "library" | "boards"

const VIEWS: { id: ChartsView; label: string }[] = [
  { id: "builder", label: "Builder" },
  { id: "library", label: "Saved charts" },
  { id: "boards", label: "Boards" },
]

export function ChartsHubTabs({
  projectId,
  view,
  search,
}: {
  projectId: string
  view: ChartsView
  search?: {
    tq?: string
    insightId?: string
    dashboardId?: string
  }
}) {
  return (
    <nav className="mb-4 flex flex-wrap gap-1 border-b border-border/60 pb-2">
      {VIEWS.map((v) => {
        const active = view === v.id
        return (
          <Link
            key={v.id}
            to="/observe/projects/$projectId/trends"
            params={{ projectId }}
            search={{
              view: v.id,
              ...(search?.tq ? { tq: search.tq } : {}),
              ...(v.id === "builder" && search?.insightId
                ? { insightId: search.insightId }
                : {}),
              ...(v.id === "boards" && search?.dashboardId
                ? { dashboardId: search.dashboardId }
                : {}),
            }}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {v.label}
          </Link>
        )
      })}
    </nav>
  )
}
