import { memo, useMemo } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { ChevronsUpDownIcon, FolderIcon, PlusIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export type DeployProjectOption = {
  id: string
  name: string
}

/** Preserve the current Deploy surface when switching projects. */
export function deployPathForProject(
  pathname: string,
  projectId: string,
): string {
  const match = pathname.match(/^\/projects\/[^/]+(?:\/([^/]+))?/)
  const surface = match?.[1]
  const allowed = new Set(["deployments", "secrets", "settings"])
  if (surface && allowed.has(surface)) {
    return `/projects/${projectId}/${surface}`
  }
  return `/projects/${projectId}`
}

const triggerClassName =
  "border border-transparent data-[popup-open]:border-sidebar-border data-[popup-open]:bg-sidebar-accent data-[state=open]:border-sidebar-border data-[state=open]:bg-sidebar-accent"

export const DeployProjectSwitcher = memo(function DeployProjectSwitcher({
  projects,
  activeProjectId,
}: {
  projects: DeployProjectOption[]
  activeProjectId?: string | null
}) {
  const router = useRouter()
  const active = activeProjectId
    ? (projects.find((p) => p.id === activeProjectId) ?? null)
    : null

  const trigger = useMemo(
    () => <SidebarMenuButton size="lg" className={triggerClassName} />,
    [],
  )

  function select(project: DeployProjectOption) {
    const pathname = router.state.location.pathname
    if (project.id === active?.id && pathname.startsWith("/projects/")) return
    const to = pathname.startsWith("/projects/")
      ? deployPathForProject(pathname, project.id)
      : `/projects/${project.id}`
    void router.navigate({ to })
  }

  if (projects.length === 0) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            render={<Link to="/" />}
            className="border border-transparent"
          >
            <div className="flex size-8 items-center justify-center rounded-md border border-sidebar-border/80">
              <PlusIcon className="size-4 opacity-60" />
            </div>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">New project</span>
              <span className="truncate text-xs text-muted-foreground">
                Create on Home
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
              {active ? (
                active.name.slice(0, 2)
              ) : (
                <FolderIcon className="size-4 opacity-60" />
              )}
            </div>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold tracking-tight">
                {active?.name ?? "Select project"}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Deploy project
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
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 rounded-md"
              render={<Link to="/" />}
            >
              <PlusIcon className="size-4" />
              All projects
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
})
