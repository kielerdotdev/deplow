import { memo, useEffect } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { ChevronsUpDownIcon, FolderIcon, PlusIcon } from "lucide-react"

import { SoftHit } from "@/components/soft-hit"
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
  deployPathForProject,
  observePathForProject,
  useProjectStore,
  type ProjectOption,
} from "@/lib/project-store"
import { cn } from "@/lib/utils"

export const ProjectSwitcher = memo(function ProjectSwitcher({
  mode,
  variant = "breadcrumb",
}: {
  mode: "deploy" | "observe"
  variant?: "breadcrumb" | "sidebar"
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

  const menu = (
    <DropdownMenuContent
      className="min-w-64 p-1.5"
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
              className={cn("gap-2 rounded-sm", selected && "bg-accent")}
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
              className="gap-2 rounded-sm"
              render={<Link to="/" />}
            >
              <PlusIcon />
              All projects
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </>
      ) : null}
    </DropdownMenuContent>
  )

  if (!loaded && projects.length === 0) {
    if (variant === "breadcrumb") {
      return (
        <div className="flex h-8 items-center gap-1.5 px-1.5 text-[14px] text-muted-foreground">
          <Spinner className="size-3.5" />
          <span>Loading…</span>
        </div>
      )
    }
    return (
      <div className="flex h-10 items-center gap-2 px-2 opacity-70">
        <Spinner className="size-3.5" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  if (projects.length === 0) {
    if (variant === "breadcrumb") {
      return (
        <SoftHit>
          <Link to="/" className="flex h-8 items-center gap-1.5 px-1.5">
            <PlusIcon className="size-4 opacity-60" />
            <span className="text-[14px] font-medium">New project</span>
          </Link>
        </SoftHit>
      )
    }
    return (
      <SoftHit>
        <Link to="/" className="flex h-10 w-full items-center gap-2 px-2">
          <PlusIcon className="size-4 opacity-60" />
          <span className="text-sm font-medium">New project</span>
        </Link>
      </SoftHit>
    )
  }

  if (variant === "breadcrumb") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="group/h relative flex w-fit cursor-pointer items-center rounded-sm outline-none"
            />
          }
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-1 rounded-sm bg-foreground/[0.08] opacity-0 transition-[inset,opacity] duration-150 ease-out group-hover/h:inset-0 group-hover/h:opacity-100 group-active/h:inset-px group-data-[popup-open]/h:inset-0 group-data-[popup-open]/h:opacity-100"
          />
          <span className="relative z-[2] flex h-8 items-center px-1.5">
            <span className="flex size-5 items-center justify-center rounded bg-white/[0.06] text-[10px] font-semibold uppercase text-foreground/70">
              {active ? (
                active.name.slice(0, 2)
              ) : (
                <FolderIcon className="size-3.5 opacity-60" />
              )}
            </span>
            <span className="max-w-[12rem] truncate px-1.5">
              {active?.name ?? "Select project"}
            </span>
            <ChevronsUpDownIcon className="size-4 text-foreground/40" />
          </span>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    )
  }

  return (
    <SoftHit className="w-full">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex h-10 w-full items-center gap-2 px-2 outline-none"
            />
          }
        >
          <div className="flex size-8 items-center justify-center rounded-sm border border-border bg-muted/40 text-xs font-semibold uppercase">
            {active ? (
              active.name.slice(0, 2)
            ) : (
              <FolderIcon className="size-4 opacity-60" />
            )}
          </div>
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium tracking-tight">
              {active?.name ?? "Select project"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {mode === "observe" ? "Observe" : "Deploy"} project
            </span>
          </div>
          <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    </SoftHit>
  )
})
