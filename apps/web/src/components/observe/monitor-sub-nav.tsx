import { Link, useRouterState } from "@tanstack/react-router"
import {
  BellIcon,
  ChartLineIcon,
  LayoutDashboardIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

const TABS = [
  {
    id: "charts",
    label: "Charts",
    icon: ChartLineIcon,
    to: "/observe/projects/$projectId/insights" as const,
    match: (path: string) =>
      path.includes("/insights") || path.includes("/trends"),
  },
  {
    id: "boards",
    label: "Boards",
    icon: LayoutDashboardIcon,
    to: "/observe/projects/$projectId/dashboards" as const,
    match: (path: string) => path.includes("/dashboards"),
  },
  {
    id: "alerts",
    label: "Alerts",
    icon: BellIcon,
    to: "/observe/projects/$projectId/alerts" as const,
    match: (path: string) => path.includes("/alerts"),
  },
] as const

export function isMonitorPath(pathname: string): boolean {
  return (
    pathname.includes("/insights") ||
    pathname.includes("/trends") ||
    pathname.includes("/dashboards") ||
    pathname.includes("/alerts")
  )
}

/**
 * Secondary nav for the Monitor cluster (charts · boards · alerts).
 * Shown under the page header so the main tab strip stays short.
 */
export function MonitorSubNav({ projectId }: { projectId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav
      className="panel-tabs shrink-0"
      aria-label="Monitor"
      data-testid="monitor-sub-nav"
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname)
        return (
          <Link
            key={tab.id}
            to={tab.to}
            params={{ projectId }}
            className={cn(
              "panel-tab inline-flex items-center gap-1.5",
              active && "panel-tab-active",
            )}
            aria-current={active ? "page" : undefined}
          >
            <tab.icon className="size-3.5 opacity-70" strokeWidth={1.75} />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
