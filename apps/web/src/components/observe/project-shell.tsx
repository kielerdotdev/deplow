import { useRouterState } from "@tanstack/react-router"

import {
  ContextBar,
  type ObserveSurface,
} from "@/components/observe/context-bar"
import {
  isMonitorPath,
  MonitorSubNav,
} from "@/components/observe/monitor-sub-nav"
import { PageContent, PageHeader } from "@/components/page-layout"
import type { ObserveContext } from "@/lib/observe/context"
import { cn } from "@/lib/utils"

function surfaceFromPath(pathname: string): ObserveSurface {
  if (pathname.includes("/traces")) return "traces"
  if (pathname.includes("/logs")) return "logs"
  if (pathname.includes("/issues")) return "issues"
  return "default"
}

/**
 * Observe page frame: Atlasflow panel header + optional context bar + body.
 * App chrome (crumbs + tabbar) is owned by AppShell.
 */
export function ObserveProjectShell({
  projectId,
  title,
  description,
  actions,
  context,
  onContextChange,
  onSaveView,
  children,
  className,
  /** Hide Monitor sub-tabs (Charts / Boards / Alerts) on this page. */
  hideMonitorNav = false,
}: {
  projectId?: string
  title: string
  description?: string
  actions?: React.ReactNode
  context?: ObserveContext
  onContextChange?: (ctx: ObserveContext) => void
  onSaveView?: (name: string) => void
  children: React.ReactNode
  className?: string
  hideMonitorNav?: boolean
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const surface = surfaceFromPath(pathname)
  const showMonitorNav =
    !hideMonitorNav && Boolean(projectId) && isMonitorPath(pathname)

  return (
    <div
      data-testid="observe-project-shell"
      className={cn("flex w-full min-w-0 flex-col", className)}
    >
      <PageHeader title={title} description={description} actions={actions} />
      {showMonitorNav && projectId ? (
        <MonitorSubNav projectId={projectId} />
      ) : null}
      {context && onContextChange ? (
        <div className="shrink-0 border-b border-border px-2 py-2">
          <ContextBar
            context={context}
            onChange={onContextChange}
            onSaveView={onSaveView}
            projectId={projectId}
            surface={surface}
          />
        </div>
      ) : null}
      {/* Scroll is owned by .app-shell-panel-scroll — do not nest overflow-y-auto. */}
      <PageContent width="wide">{children}</PageContent>
    </div>
  )
}

/** @deprecated Use PageHeader — kept for tests that import the old name. */
export function ObservePageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <PageHeader
      title={title}
      description={description}
      actions={actions}
      className={className}
    />
  )
}
