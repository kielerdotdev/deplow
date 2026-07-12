import { Link, useRouterState } from "@tanstack/react-router"
import {
  BellIcon,
  ChevronsUpDownIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PlugIcon,
  ServerIcon,
  UsersIcon,
} from "lucide-react"

import { CommandAction } from "@/components/command-action"
import {
  CommandPalette,
  CommandPaletteTrigger,
} from "@/components/command-palette"
import { DeplowLogo } from "@/components/deplow-logo"
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

type AppShellProps = {
  user: {
    name: string
    email: string
  }
  instanceAdmin?: boolean
  organizations?: OrgOption[]
  activeOrganization?: OrgOption | null
  actions?: React.ReactNode
  children: React.ReactNode
}

const primaryNav = [
  {
    title: "Home",
    to: "/" as const,
    icon: LayoutDashboardIcon,
    match: (path: string) => path === "/" || path.startsWith("/projects"),
  },
  {
    title: "Team",
    to: "/organization" as const,
    icon: UsersIcon,
    match: (path: string) => path.startsWith("/organization"),
  },
  {
    title: "Settings",
    to: "/settings" as const,
    icon: KeyRoundIcon,
    match: (path: string) => path.startsWith("/settings"),
  },
]

const systemNav = [
  {
    title: "Integrations",
    to: "/integrations" as const,
    icon: PlugIcon,
    match: (path: string) => path.startsWith("/integrations"),
  },
  {
    title: "Domains",
    to: "/domains" as const,
    icon: GlobeIcon,
    match: (path: string) => path.startsWith("/domains"),
  },
  {
    title: "Notifications",
    to: "/notifications" as const,
    icon: BellIcon,
    match: (path: string) => path.startsWith("/notifications"),
  },
  {
    title: "Nodes",
    to: "/nodes" as const,
    icon: ServerIcon,
    match: (path: string) => path.startsWith("/nodes"),
  },
]

export function AppShell({
  user,
  instanceAdmin = false,
  organizations = [],
  activeOrganization = null,
  actions,
  children,
}: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

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
                  render={<Link to="/" />}
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
            {organizations.length > 1 ? (
              <OrgSwitcher
                organizations={organizations}
                active={activeOrganization}
              />
            ) : null}
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {primaryNav.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={item.match(pathname)}
                        tooltip={item.title}
                        render={<Link to={item.to} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {instanceAdmin ? (
              <SidebarGroup>
                <SidebarGroupLabel>Platform</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {systemNav.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          isActive={item.match(pathname)}
                          tooltip={item.title}
                          render={<Link to={item.to} />}
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
                      <span className="truncate font-medium">{user.name}</span>
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
                        render={<Link to="/organization" />}
                      >
                        <UsersIcon />
                        Team
                      </DropdownMenuItem>
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
              <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
            ) : null}
          </header>
          <div className="animate-content-in flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:px-6 md:py-5">
            {children}
          </div>
        </SidebarInset>
        </SidebarProvider>
      </CommandProvider>
    </TooltipProvider>
  )
}
