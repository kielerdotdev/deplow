import { memo, useMemo } from "react"
import { useRouter } from "@tanstack/react-router"
import { ChevronsUpDownIcon, FolderIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export type ObserveProjectOption = {
  id: string
  name: string
}

/** Preserve the current Observe surface when switching projects. */
export function observePathForProject(
  pathname: string,
  projectId: string,
): string {
  const match = pathname.match(
    /^\/observe\/projects\/[^/]+(?:\/([^/]+(?:\/[^/]+)?))?/,
  )
  const rest = match?.[1]
  if (!rest || rest === "setup") {
    return `/observe/projects/${projectId}`
  }
  const surface = rest.split("/")[0]
  const allowed = new Set([
    "services",
    "dashboards",
    "insights",
    "explore",
    "traces",
    "logs",
    "issues",
    "releases",
    "alerts",
    "trends",
  ])
  if (allowed.has(surface)) {
    return `/observe/projects/${projectId}/${surface}`
  }
  return `/observe/projects/${projectId}`
}

const triggerClassName =
  "border border-transparent data-[popup-open]:border-sidebar-border data-[popup-open]:bg-sidebar-accent data-[state=open]:border-sidebar-border data-[state=open]:bg-sidebar-accent"

export const ObserveProjectSwitcher = memo(function ObserveProjectSwitcher({
  projects,
  activeProjectId,
}: {
  projects: ObserveProjectOption[]
  activeProjectId?: string | null
}) {
  const router = useRouter()
  const active =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null

  const trigger = useMemo(
    () => <SidebarMenuButton size="lg" className={triggerClassName} />,
    [],
  )

  function select(project: ObserveProjectOption) {
    if (project.id === active?.id) return
    const pathname = router.state.location.pathname
    const to = observePathForProject(pathname, project.id)
    void router.navigate({ to })
  }

  if (projects.length === 0) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none opacity-70">
            <div className="flex size-8 items-center justify-center rounded-md border border-sidebar-border/80">
              <FolderIcon className="size-4 opacity-60" />
            </div>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">No projects</span>
              <span className="truncate text-xs text-muted-foreground">
                Create one in Deploy
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={trigger}>
            <div className="flex size-8 items-center justify-center rounded-md border border-sidebar-border/80 bg-sidebar-accent/40 text-xs font-semibold uppercase">
              {(active?.name ?? "?").slice(0, 2)}
            </div>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold tracking-tight">
                {active?.name ?? "Select project"}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Observe project
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-64 p-1.5"
            side="bottom"
            align="start"
            sideOffset={6}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Switch project
              </DropdownMenuLabel>
              {projects.map((project) => {
                const selected = project.id === active?.id
                return (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => select(project)}
                    className={cn("gap-2 rounded-md", selected && "bg-accent")}
                  >
                    <span className="truncate font-medium">{project.name}</span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
})
