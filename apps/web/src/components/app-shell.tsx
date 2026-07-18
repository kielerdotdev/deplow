import { useEffect, useMemo } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import {
  ActivityIcon,
  BugIcon,
  ChartLineIcon,
  GaugeIcon,
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
import { HostrigLogo } from "@/components/hostrig-logo"
import { SoftHit } from "@/components/soft-hit"
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
      // Project list only — not /services/.../deployments/...
      match: (path: string) =>
        path === `${base}/deployments` ||
        path.startsWith(`${base}/deployments/`),
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
          // Charts · Boards · Alerts live under Monitor sub-tabs (not top-level).
          title: "Monitor",
          to: `${base}/insights`,
          icon: ChartLineIcon,
          match: (path: string) =>
            path.includes("/insights") ||
            path.includes("/trends") ||
            path.includes("/dashboards") ||
            path.includes("/alerts"),
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
          icon: GaugeIcon,
          match: (path: string) => path.includes("/metrics"),
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

function NavTab({
  item,
  active,
  search,
}: {
  item: NavItem
  active: boolean
  search?: Record<string, unknown>
}) {
  return (
    <SoftHit active={active} className="shrink-0">
      <Link
        to={item.to as never}
        search={
          search && Object.keys(search).length > 0
            ? (search as never)
            : undefined
        }
        className="flex h-8 items-center gap-1.5 px-1.5 sm:px-2"
        title={item.title}
      >
        <span className="flex size-5 items-center justify-center">
          <item.icon
            className={cn(
              "size-3.5 transition-colors sm:size-4",
              active
                ? "text-foreground"
                : "text-foreground/40 group-hover/h:text-foreground",
            )}
            strokeWidth={1.75}
          />
        </span>
        <span className="text-[13px] font-medium text-foreground sm:text-[14px]">
          {item.title}
        </span>
      </Link>
    </SoftHit>
  )
}

function ShellChrome({
  mode,
  deployHome,
  observeHome,
  observeEnabled,
  observeSearch,
  organizations,
  activeOrganization,
  user,
  onSignOut,
  children,
}: {
  mode: "deploy" | "observe"
  deployHome: string
  observeHome: string
  observeEnabled: boolean
  observeSearch: Record<string, unknown>
  organizations: OrgOption[]
  activeOrganization: OrgOption | null
  user: { name: string; email: string }
  onSignOut: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="app-shell-chrome flex h-12 items-center justify-between gap-3 border-b border-border px-2">
      <div className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-foreground">
        <SoftHit>
          <Link
            to={mode === "observe" ? observeHome : deployHome}
            className="flex size-8 items-center justify-center"
            title="Hostrig home"
          >
            <HostrigLogo size={20} className="text-foreground" />
          </Link>
        </SoftHit>

        {organizations.length > 0 ? (
          <>
            <span className="app-crumb-sep">/</span>
            <OrgSwitcher
              organizations={organizations}
              active={activeOrganization}
              variant="breadcrumb"
            />
          </>
        ) : null}

        <span className="app-crumb-sep">/</span>
        <ProjectSwitcher mode={mode} variant="breadcrumb" />

        {children}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <CommandPaletteTrigger className="hidden sm:inline-flex" />
        <ThemeToggle />
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
              className="pointer-events-none absolute inset-1 rounded-sm bg-foreground/[0.08] opacity-0 transition-[inset,opacity] duration-150 ease-out group-hover/h:inset-0 group-hover/h:opacity-100 group-active/h:inset-px"
            />
            <span className="relative z-[2] flex items-center justify-center p-0.5">
              <PersonAvatar
                name={user.name}
                email={user.email}
                className="size-8 ring-1 ring-white/10"
              />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 p-1.5"
            align="end"
            sideOffset={6}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1.5 font-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {mode === "deploy" && observeEnabled ? (
                <DropdownMenuItem
                  className="gap-2 rounded-sm"
                  render={
                    <Link
                      to={observeHome}
                      search={
                        Object.keys(observeSearch).length > 0
                          ? (observeSearch as never)
                          : undefined
                      }
                    />
                  }
                >
                  <ActivityIcon />
                  Open Observe
                </DropdownMenuItem>
              ) : null}
              {mode === "observe" ? (
                <DropdownMenuItem
                  className="gap-2 rounded-sm"
                  render={<Link to={deployHome} />}
                >
                  <RocketIcon />
                  Open Deploy
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="gap-2 rounded-sm"
                render={<Link to="/settings" />}
              >
                <KeyRoundIcon />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="gap-2 rounded-sm"
                onClick={onSignOut}
              >
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
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
  const observeNav =
    mode === "observe" && !accountHome
      ? buildObserveNav(activeProjectId ?? undefined).flatMap((g) => g.items)
      : []
  // Service pages own their own nav (Overview / Deployments / …).
  // Hiding project chrome avoids tab-under-tab with identical labels.
  const onServiceRoute = /\/projects\/[^/]+\/services\//.test(pathname)
  const deployNav =
    mode === "deploy" && !accountHome && !onServiceRoute
      ? buildDeployNav(activeProjectId ?? undefined)
      : []
  const navItems = mode === "observe" ? observeNav : deployNav

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

        <div className="app-shell" data-ui-mode={mode}>
          <ShellChrome
            mode={mode}
            deployHome={deployHome}
            observeHome={observeHome}
            observeEnabled={observeEnabled}
            observeSearch={observeSearch}
            organizations={organizations}
            activeOrganization={activeOrganization}
            user={user}
            onSignOut={handleSignOut}
          >
            <span className="app-crumb-sep mx-0.5">·</span>
            <div className="flex items-center gap-0.5">
              <SoftHit active={mode === "deploy"}>
                <Link
                  to={deployHome}
                  className="flex h-8 items-center px-2 text-[13px] font-medium"
                  title="Deploy"
                >
                  <span
                    className={cn(
                      mode === "deploy"
                        ? "text-foreground"
                        : "text-foreground/40 group-hover/h:text-foreground",
                    )}
                  >
                    Deploy
                  </span>
                </Link>
              </SoftHit>
              {observeEnabled ? (
                <SoftHit active={mode === "observe"}>
                  <Link
                    to={observeHome}
                    search={
                      Object.keys(observeSearch).length > 0
                        ? (observeSearch as never)
                        : undefined
                    }
                    className="flex h-8 items-center px-2 text-[13px] font-medium"
                    title="Observe"
                  >
                    <span
                      className={cn(
                        mode === "observe"
                          ? "text-foreground"
                          : "text-foreground/40 group-hover/h:text-foreground",
                      )}
                    >
                      Observe
                    </span>
                  </Link>
                </SoftHit>
              ) : (
                <span
                  className="flex h-8 items-center px-2 text-[13px] font-medium text-foreground/30"
                  title="Observe is not enabled on this instance"
                  aria-disabled="true"
                >
                  Observe
                </span>
              )}
            </div>
          </ShellChrome>

          {navItems.length > 0 ? (
            <div className="app-shell-chrome flex h-12 items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {navItems.map((item) => (
                <NavTab
                  key={item.title}
                  item={item}
                  active={item.match(pathname)}
                  search={
                    mode === "observe" ? observeSearch : undefined
                  }
                />
              ))}
              {actions ? (
                <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
                  {actions}
                </div>
              ) : null}
            </div>
          ) : actions ? (
            <div className="app-shell-chrome flex h-12 items-center justify-end gap-1.5 px-2">
              {actions}
            </div>
          ) : null}

          <div className="app-shell-panel">
            {/* Not a flex container: content must grow taller than the
                viewport so overflow-y-auto on panel-scroll can engage. */}
            <div className="app-shell-panel-scroll animate-content-in min-w-0">
              <div className="app-shell-frame">{children}</div>
            </div>
          </div>
        </div>
      </CommandProvider>
    </TooltipProvider>
  )
}
