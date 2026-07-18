import { useRouterState } from "@tanstack/react-router"

import {
  ContextBar,
  type ObserveSurface,
} from "@/components/observe/context-bar"
import { PageContent, PageHeader } from "@/components/page-layout"
import type { ObserveContext } from "@/lib/observe/context"
import { cn } from "@/lib/utils"

function surfaceFromPath(pathname: string): ObserveSurface {
  if (pathname.includes("/traces")) return "traces"
  if (pathname.includes("/logs")) return "logs"
  if (pathname.includes("/explore")) return "explore"
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
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const surface = surfaceFromPath(pathname)

  return (
    <div
      data-testid="observe-project-shell"
      className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col", className)}
    >
      <PageHeader title={title} description={description} actions={actions} />
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
      <PageContent width="wide" className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </PageContent>
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
