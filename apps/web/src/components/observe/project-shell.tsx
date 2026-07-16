import { useEffect, useState } from "react"

import { AppShell } from "@/components/app-shell"
import type { OrgOption } from "@/components/org-switcher"
import { ContextBar } from "@/components/observe/context-bar"
import type { ObserveProjectOption } from "@/components/observe/project-switcher"
import { PageContent, PageHeader } from "@/components/page-layout"
import type { ObserveContext } from "@/lib/observe/context"
import { client } from "@/lib/orpc"

type ShellUser = { name: string; email: string }

export function ObserveProjectShell({
  user,
  instanceAdmin,
  organizations,
  activeOrganization,
  observeEnabled,
  projectId,
  title,
  description,
  actions,
  context,
  onContextChange,
  onSaveView,
  children,
}: {
  user: ShellUser
  instanceAdmin?: boolean
  organizations?: OrgOption[]
  activeOrganization?: OrgOption | null
  observeEnabled: boolean
  projectId: string
  title: string
  description?: string
  actions?: React.ReactNode
  context?: ObserveContext
  onContextChange?: (ctx: ObserveContext) => void
  onSaveView?: (name: string) => void
  children: React.ReactNode
}) {
  const [projects, setProjects] = useState<ObserveProjectOption[]>([])

  useEffect(() => {
    let cancelled = false
    void client.projects
      .list()
      .then((list) => {
        if (!cancelled) {
          setProjects(list.map((p) => ({ id: p.id, name: p.name })))
        }
      })
      .catch(() => {
        if (!cancelled) setProjects([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AppShell
      user={user}
      instanceAdmin={instanceAdmin}
      organizations={organizations}
      activeOrganization={activeOrganization}
      uiMode="observe"
      observeEnabled={observeEnabled}
      observeProjectId={projectId}
      observeProjects={projects}
    >
      <PageHeader title={title} description={description} actions={actions} />
      <PageContent>
        {context && onContextChange ? (
          <ContextBar
            context={context}
            onChange={onContextChange}
            onSaveView={onSaveView}
            className="mb-4"
          />
        ) : null}
        {children}
      </PageContent>
    </AppShell>
  )
}
