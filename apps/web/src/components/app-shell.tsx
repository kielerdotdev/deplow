import { useEffect, useMemo } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import {
  ActivityIcon,
  BellIcon,
  BugIcon,
  ChartLineIcon,
  ChevronsUpDownIcon,
  CompassIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  ListTreeIcon,
  LogOutIcon,
  RocketIcon,
  ScrollTextIcon,
  ServerIcon,
  Settings2Icon,
  TagIcon,
} from "lucide-react"

import { CommandAction } from "@/components/command-action"
import {
  CommandPalette,
  CommandPaletteTrigger,
} from "@/components/command-palette"
import { DeplowLogo } from "@/components/deplow-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { ProjectSwitcher } from "@/components/project-switcher"
import {
  OrgSwitcher,
  type OrgOption,
} from "@/components/org-switcher"
import { PersonAvatar } from "@/components/org-ui"
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
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { authClient } from "@/lib/auth-client"
import { CommandProvider } from "@/lib/command"
import { pickObserveNavSearch } from "@/lib/observe/context"
import {
  syncActiveProjectFromPath,
  useProjectStore,
} from "@/lib/project-store"
import { cn } from "@/lib/utils"

type AppShellProps = {
  user: {
    name: string
    email: string
  }
  instanceAdmin?: boolean
  organizations?: OrgOption[]
  activeOrganization?: OrgOption | null
  actions?: React.ReactNode
  accountHome?: boolean
  uiMode?: "deploy" | "observe"
  observeEnabled?: boolean
  children: React.ReactNode
}

function buildDeployNav(projectId?: string) {
  if (!projectId) return []
  const base = `/projects/${projectId}`
  return [
    {
      title: "Overview",
      to: base,
      icon: LayoutGridIcon,
      match: (path: string) => path === base || path === `${base}/`,
    },
    {
      title: "Deployments",
      to: `${base}/deployments`,
      icon: RocketIcon,
      match: (path: string) => path.includes("/deployments"),
    },
    {
      title: "Secrets",
      to: `${base}/secrets`,
      icon: KeyRoundIcon,
      match: (path: string) => path.includes("/secrets"),
    },
    {
      title: "Settings",
      to: `${base}/settings`,
      icon: Settings2Icon,
      match: (path: string) =>
        path.endsWith("/settings") && path.includes("/projects/"),
    },
  ]
}

type NavItem = {
  title: string
  to: string
  icon: typeof ActivityIcon
  match: (path: string) => boolean
}

type NavGroup = { label: string; items: NavItem[] }

function buildObserveNav(projectId?: string): NavGroup[] {
  if (!projectId) return []
  const base = `/observe/projects/${projectId}`
  return [
    {
      label: "Monitor",
      items: [
        {
          title: "Overview",
          to: base,
          icon: ActivityIcon,
          match: (path: string) => path === base || path === `${base}/`,
        },
        {
          title: "Services",
          to: `${base}/services`,
          icon: ServerIcon,
          match: (path: string) => path.includes("/services"),
        },
        {
          title: "Charts",
          to: `${base}/trends`,
          icon: ChartLineIcon,
          match: (path: string) => path.includes("/trends"),
        },
        {
          title: "Saved charts",
          to: `${base}/insights`,
          icon: ChartLineIcon,
          match: (path: string) => path.includes("/insights"),
        },
        {
          title: "Boards",
          to: `${base}/dashboards`,
          icon: LayoutDashboardIcon,
          match: (path: string) => path.includes("/dashboards"),
        },
        {
          title: "Alerts",
          to: `${base}/alerts`,
          icon: BellIcon,
          match: (path: string) => path.includes("/alerts"),
        },
      ],
    },
    {
      label: "Investigate",
      items: [
        {
          title: "Issues",
          to: `${base}/issues`,
          icon: BugIcon,
          match: (path: string) => path.includes("/issues"),
        },
        {
          title: "Traces",
          to: `${base}/traces`,
          icon: ListTreeIcon,
          match: (path: string) => path.includes("/traces"),
        },
        {
          title: "Logs",
          to: `${base}/logs`,
          icon: ScrollTextIcon,
          match: (path: string) => path.includes("/logs"),
        },
        {
          title: "Metrics",
          to: `${base}/metrics`,
          icon: ChartLineIcon,
          match: (path: string) => path.includes("/metrics"),
        },
        {
          title: "Explore",
          to: `${base}/explore`,
          icon: CompassIcon,
          match: (path: string) => path.includes("/explore"),
        },
      ],
    },
    {
      label: "Changes",
      items: [
        {
          title: "Releases",
          to: `${base}/releases`,
          icon: TagIcon,
          match: (path: string) => path.includes("/releases"),
        },
      ],
    },
  ]
}

export function AppShell({
  user,
  instanceAdmin: _instanceAdmin = false,
  organizations = [],
  activeOrganization = null,
  actions,
  accountHome,
  uiMode,
  observeEnabled = false,
  children,
}: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const rawSearch = useRouterState({ select: (s) => s.location.search })
  const observeSearch = useMemo(
    () =>
      pathname.startsWith("/observe")
        ? pickObserveNavSearch(
            rawSearch as unknown as Record<string, unknown>,
          )
        : {},
    [pathname, rawSearch],
  )
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const mode =
    uiMode ?? (pathname.startsWith("/observe") ? "observe" : "deploy")
  const observeGroups =
    mode === "observe"
      ? buildObserveNav(activeProjectId ?? undefined)
      : []
  const deployNav =
    mode === "deploy" ? buildDeployNav(activeProjectId ?? undefined) : []

  useEffect(() => {
    syncActiveProjectFromPath(pathname)
  }, [pathname])

  const deployHome = activeProjectId
    ? `/projects/${activeProjectId}`
    : "/"
  const observeHome = activeProjectId
    ? `/observe/projects/${activeProjectId}`
    : "/observe"

  async function handleSignOut() {
    await authClient.signOut()
    window.location.href = "/login"
  }

  return (
    <TooltipProvider>
      <CommandProvider>
        <SidebarProvider>
          <CommandPalette />
          <CommandAction
            id="account.sign-out"
            label="Sign out"
            group="Account"
            mode="action"
            keywords={["logout", "exit"]}
            icon={LogOutIcon}
            onSelect={handleSignOut}
          />
          <Sidebar
            collapsible="icon"
            className="border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur-sm"
            style={{ viewTransitionName: "app-sidebar" }}
          >
            <SidebarHeader className="gap-1.5 border-b border-sidebar-border/70 pb-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="lg"
                    render={
                      <Link to={mode === "observe" ? observeHome : deployHome} />
                    }
                    className="data-[slot=sidebar-menu-button]:p-1.5!"
                  >
                    <DeplowLogo size={22} className="text-foreground" />
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold tracking-[-0.03em]">
                        Hostrig
                      </span>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              <div className="mx-2 flex h-9 items-stretch rounded-md border border-sidebar-border bg-background/40 p-0.5 text-xs">
                <Link
                  to={deployHome}
                  title="Deploy — same project; deployment and service config"
                  className={cn(
                    "flex flex-1 items-center justify-center rounded-[3px] px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    mode === "deploy"
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Deploy
                </Link>
                {observeEnabled ? (
                  <Link
                    to={observeHome}
                    search={
                      Object.keys(observeSearch).length > 0
                        ? (observeSearch as never)
                        : undefined
                    }
                    className={cn(
                      "flex flex-1 items-center justify-center rounded-[3px] px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      mode === "observe"
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    title="Observe — same project; investigation scope carried when set"
                  >
                    Observe
                  </Link>
                ) : (
                  <span
                    className="flex flex-1 cursor-not-allowed items-center justify-center rounded-[3px] px-2 text-muted-foreground/50"
                    title="Observe is not enabled on this instance"
                    aria-disabled="true"
                  >
                    Observe
                  </span>
                )}
              </div>
              {organizations.length > 1 ? (
                <OrgSwitcher
                  organizations={organizations}
                  active={activeOrganization}
                />
              ) : null}
              <ProjectSwitcher mode={mode} />
            </SidebarHeader>

            <SidebarContent>
              {mode === "observe"
                ? observeGroups.map((group) => (
                    <SidebarGroup key={group.label}>
                      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          {group.items.map((item) => (
                            <SidebarMenuItem key={item.title}>
                              <SidebarMenuButton
                                isActive={item.match(pathname)}
                                tooltip={item.title}
                                render={
                                  <Link
                                    to={item.to as never}
                                    search={
                                      Object.keys(observeSearch).length > 0
                                        ? (observeSearch as never)
                                        : undefined
                                    }
                                  />
                                }
                              >
                                <item.icon />
                                <span>{item.title}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </SidebarGroup>
                  ))
                : deployNav.length > 0 ? (
                    <SidebarGroup>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          {deployNav.map((item) => (
                            <SidebarMenuItem key={item.title}>
                              <SidebarMenuButton
                                isActive={item.match(pathname)}
                                tooltip={item.title}
                                render={<Link to={item.to as never} />}
                              >
                                <item.icon />
                                <span>{item.title}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </SidebarGroup>
                  ) : null}
            </SidebarContent>

            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <SidebarMenuButton
                          size="lg"
                          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        />
                      }
                    >
                      <PersonAvatar name={user.name} email={user.email} />
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">
                          {user.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </span>
                      </div>
                      <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-(--anchor-width) min-w-56 p-1.5"
                      side="top"
                      align="start"
                      sideOffset={6}
                    >
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="px-2 py-1.5 font-normal">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium">
                              {user.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </div>
                        </DropdownMenuLabel>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          className="gap-2 rounded-md"
                          render={<Link to="/settings" />}
                        >
                          <KeyRoundIcon />
                          Settings
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          className="gap-2 rounded-md"
                          onClick={handleSignOut}
                        >
                          <LogOutIcon />
                          Sign out
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>

          <SidebarInset className="min-w-0 overflow-x-hidden bg-transparent">
            <header className="sticky top-0 z-20 shrink-0 border-b border-border/70 bg-background/75 backdrop-blur-xl">
              <div className="page-container flex h-12 items-center gap-2">
                <SidebarTrigger className="-ml-0.5" />
                <div className="flex-1" />
                <CommandPaletteTrigger className="mr-0.5" />
                <ThemeToggle />
                {actions ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {actions}
                  </div>
                ) : null}
              </div>
            </header>
            <div
              className={cn(
                "animate-content-in page-container flex min-w-0 flex-1 flex-col gap-4 overflow-x-hidden py-3 md:py-4",
                accountHome && "pt-2",
              )}
            >
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </CommandProvider>
    </TooltipProvider>
  )
}
