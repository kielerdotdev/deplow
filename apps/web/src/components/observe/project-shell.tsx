import { useRouterState } from "@tanstack/react-router"

import {
  ContextBar,
  type ObserveSurface,
} from "@/components/observe/context-bar"
import { PageContent, PageHeader } from "@/components/page-layout"
import type { ObserveContext } from "@/lib/observe/context"

function surfaceFromPath(pathname: string): ObserveSurface {
  if (pathname.includes("/traces")) return "traces"
  if (pathname.includes("/logs")) return "logs"
  if (pathname.includes("/explore")) return "explore"
  if (pathname.includes("/issues")) return "issues"
  return "default"
}

/**
 * Observe page frame (header + context bar). Chrome is owned by the
 * `/observe/projects/$projectId` layout so it stays mounted across tabs.
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
}: {
  projectId?: string
  title: string
  description?: string
  actions?: React.ReactNode
  context?: ObserveContext
  onContextChange?: (ctx: ObserveContext) => void
  onSaveView?: (name: string) => void
  children: React.ReactNode
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const surface = surfaceFromPath(pathname)

  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />
      <PageContent>
        {context && onContextChange ? (
          <ContextBar
            context={context}
            onChange={onContextChange}
            onSaveView={onSaveView}
            projectId={projectId}
            surface={surface}
          />
        ) : null}
        {children}
      </PageContent>
    </>
  )
}
