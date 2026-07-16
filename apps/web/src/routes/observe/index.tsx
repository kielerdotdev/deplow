import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { AppShell } from "@/components/app-shell"
import type { ObserveProjectOption } from "@/components/observe/project-switcher"
import { PageContent, PageHeader } from "@/components/page-layout"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/observe/")({
  loader: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const shell = await loadShellContext()
    const status = await client.observe.status().catch(() => null)
    const projects = await client.projects.list().catch(() => [])
    if (status?.enabled && projects[0]) {
      throw redirect({
        to: "/observe/projects/$projectId",
        params: { projectId: projects[0].id },
      })
    }
    return { session, shell, status, projects }
  },
  component: ObserveHome,
})

function ObserveHome() {
  const { session, shell, status, projects } = Route.useLoaderData()
  const observeEnabled = status?.enabled === true
  const [observeProjects, setObserveProjects] = useState<
    ObserveProjectOption[]
  >(projects.map((p) => ({ id: p.id, name: p.name })))

  useEffect(() => {
    setObserveProjects(projects.map((p) => ({ id: p.id, name: p.name })))
  }, [projects])

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      uiMode="observe"
      observeEnabled={observeEnabled}
      observeProjects={observeProjects}
    >
      <PageHeader
        title="Observe"
        description="Errors, traces, and metrics for projects you deploy."
      />
      <PageContent>
        {!observeEnabled ? (
          <p className="text-sm text-muted-foreground">
            Observe is off. Set{" "}
            <code className="text-xs">DEPLOW_OBSERVE_ENABLED=1</code> and start{" "}
            <code className="text-xs">
              docker compose --profile observe up -d
            </code>
            .
          </p>
        ) : (
          <div className="flex min-h-[min(20rem,50vh)] flex-col items-center justify-center text-center">
            <p className="text-sm font-medium">No projects yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create a project in Deploy mode, then pick it from the sidebar to
              start observing.
            </p>
          </div>
        )}
      </PageContent>
    </AppShell>
  )
}
