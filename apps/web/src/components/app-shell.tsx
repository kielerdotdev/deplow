import { Link, useRouterState } from "@tanstack/react-router"
import {
  BoxIcon,
  ChevronsUpDownIcon,
  ContainerIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ServerIcon,
} from "lucide-react"

import { authClient } from "@/lib/auth-client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
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

type AppShellProps = {
  user: {
    name: string
    email: string
  }
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

const navItems = [
  {
    title: "Projects",
    to: "/" as const,
    icon: LayoutDashboardIcon,
    match: (path: string) => path === "/" || path.startsWith("/projects"),
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
  title,
  description,
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
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  render={<Link to="/" />}
                  className="data-[slot=sidebar-menu-button]:p-1.5!"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <BoxIcon className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">deplow</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Project runtime
                    </span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Platform</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
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
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted text-xs font-medium uppercase">
                      {(user.name || user.email).slice(0, 2)}
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                    <ChevronsUpDownIcon className="ml-auto size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-(--anchor-width) min-w-56"
                    side="top"
                    align="start"
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="font-normal">
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
                      <DropdownMenuItem onClick={handleSignOut}>
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

        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ContainerIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                {title ? (
                  <>
                    <h1 className="truncate text-sm font-semibold leading-none">
                      {title}
                    </h1>
                    {description ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {description}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Dashboard
                  </span>
                )}
              </div>
            </div>
            {actions ? (
              <div className="flex shrink-0 items-center gap-2">{actions}</div>
            ) : null}
          </header>
          <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
