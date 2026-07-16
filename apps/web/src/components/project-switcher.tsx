import { memo, useEffect, useMemo } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { ChevronsUpDownIcon, FolderIcon, PlusIcon } from "lucide-react"

import { Spinner } from "@/components/ui/spinner"

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
import {
  deployPathForProject,
  observePathForProject,
  useProjectStore,
  type ProjectOption,
} from "@/lib/project-store"
import { cn } from "@/lib/utils"

const triggerClassName =
  "border border-transparent data-[popup-open]:border-sidebar-border data-[popup-open]:bg-sidebar-accent data-[state=open]:border-sidebar-border data-[state=open]:bg-sidebar-accent"

export const ProjectSwitcher = memo(function ProjectSwitcher({
  mode,
}: {
  mode: "deploy" | "observe"
}) {
  const router = useRouter()
  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const loaded = useProjectStore((s) => s.loaded)
  const ensureLoaded = useProjectStore((s) => s.ensureLoaded)
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId)

  useEffect(() => {
    void ensureLoaded()
  }, [ensureLoaded])

  const active =
    (activeProjectId
      ? projects.find((p) => p.id === activeProjectId)
      : null) ??
    projects[0] ??
    null

  const trigger = useMemo(
    () => <SidebarMenuButton size="lg" className={triggerClassName} />,
    [],
  )

  function select(project: ProjectOption) {
    setActiveProjectId(project.id)
    const pathname = router.state.location.pathname
    if (mode === "observe") {
      if (
        project.id === active?.id &&
        pathname.startsWith("/observe/projects/")
      ) {
        return
      }
      void router.navigate({
        to: observePathForProject(pathname, project.id),
      })
      return
    }
    if (project.id === active?.id && pathname.startsWith("/projects/")) return
    const to = pathname.startsWith("/projects/")
      ? deployPathForProject(pathname, project.id)
      : `/projects/${project.id}`
    void router.navigate({ to })
  }

  if (!loaded && projects.length === 0) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none opacity-70">
            <div className="flex size-8 items-center justify-center rounded-md border border-sidebar-border/80">
              <Spinner className="size-3.5 opacity-70" />
            </div>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Projects</span>
              <span className="truncate text-xs text-muted-foreground">
                Loading…
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
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
                {mode === "observe" ? "Observe" : "Deploy"} project
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
            {mode === "deploy" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="gap-2 rounded-md"
                    render={<Link to="/" />}
                  >
                    <PlusIcon />
                    All projects
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
})
