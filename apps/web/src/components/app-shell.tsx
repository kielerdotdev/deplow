import { Link, useRouterState } from "@tanstack/react-router"
import {
  ActivityIcon,
  BugIcon,
  ChartLineIcon,
  ChevronsUpDownIcon,
  CompassIcon,
  KeyRoundIcon,
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
import {
  DeployProjectSwitcher,
  type DeployProjectOption,
} from "@/components/deploy-project-switcher"
import {
  ObserveProjectSwitcher,
  type ObserveProjectOption,
} from "@/components/observe/project-switcher"
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
import { cn } from "@/lib/utils"

const EMPTY_PROJECTS: DeployProjectOption[] = []
const EMPTY_OBSERVE_PROJECTS: ObserveProjectOption[] = []

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
  /** When set, Observe sidebar links target this project. */
  observeProjectId?: string
  observeProjects?: ObserveProjectOption[]
  /** When set, Deploy sidebar links target this project. */
  deployProjectId?: string
  deployProjects?: DeployProjectOption[]
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

function buildObserveNav(projectId?: string) {
  if (!projectId) {
    return []
  }
  const base = `/observe/projects/${projectId}`
  return [
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
      match: (path: string) =>
        path.includes("/trends") ||
        path.includes("/insights") ||
        path.includes("/dashboards") ||
        path.includes("/alerts"),
    },
    {
      title: "Explore",
      to: `${base}/explore`,
      icon: CompassIcon,
      match: (path: string) => path.includes("/explore"),
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
      title: "Issues",
      to: `${base}/issues`,
      icon: BugIcon,
      match: (path: string) => path.includes("/issues"),
    },
    {
      title: "Releases",
      to: `${base}/releases`,
      icon: TagIcon,
      match: (path: string) => path.includes("/releases"),
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
  observeEnabled: _observeEnabled = false,
  observeProjectId,
  observeProjects = EMPTY_OBSERVE_PROJECTS,
  deployProjectId,
  deployProjects = EMPTY_PROJECTS,
  children,
}: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const mode =
    uiMode ?? (pathname.startsWith("/observe") ? "observe" : "deploy")
  const primaryNav =
    mode === "observe"
      ? buildObserveNav(observeProjectId)
      : buildDeployNav(deployProjectId)

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
            className="border-r border-sidebar-border/70 bg-sidebar"
          >
            <SidebarHeader className="gap-1.5 border-b border-sidebar-border/70 pb-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="lg"
                    render={
                      <Link to={mode === "observe" ? "/observe" : "/"} />
                    }
                    className="data-[slot=sidebar-menu-button]:p-1.5!"
                  >
                    <DeplowLogo size={22} className="text-foreground" />
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold tracking-[-0.03em]">
                        deplow
                      </span>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              <div className="mx-2 flex rounded-md border border-sidebar-border/80 p-0.5 text-xs">
                <Link
                  to="/"
                  className={cn(
                    "flex-1 rounded-sm px-2 py-1 text-center",
                    mode === "deploy"
                      ? "bg-sidebar-accent font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Deploy
                </Link>
                <Link
                  to="/observe"
                  className={cn(
                    "flex-1 rounded-sm px-2 py-1 text-center",
                    mode === "observe"
                      ? "bg-sidebar-accent font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Observe
                </Link>
              </div>
              {organizations.length > 1 ? (
                <OrgSwitcher
                  organizations={organizations}
                  active={activeOrganization}
                />
              ) : null}
              {mode === "observe" ? (
                <ObserveProjectSwitcher
                  projects={observeProjects}
                  activeProjectId={observeProjectId}
                />
              ) : (
                <DeployProjectSwitcher
                  projects={deployProjects}
                  activeProjectId={deployProjectId}
                />
              )}
            </SidebarHeader>

            <SidebarContent>
              {primaryNav.length > 0 ? (
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {primaryNav.map((item) => (
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

          <SidebarInset className="min-w-0 overflow-x-hidden bg-background">
            <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-4 backdrop-blur-md md:px-6">
              <SidebarTrigger className="-ml-0.5" />
              <div className="flex-1" />
              <CommandPaletteTrigger className="mr-1" />
              {actions ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  {actions}
                </div>
              ) : null}
            </header>
            <div
              className={cn(
                "animate-content-in flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:px-6 md:py-5",
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
