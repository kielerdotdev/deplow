import { createFileRoute, Link, redirect } from "@tanstack/react-router"

import { AppShell } from "@/components/app-shell"
import { PageContent, PageHeader } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { useProjectStore } from "@/lib/project-store"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/observe/")({
  loader: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const shell = await loadShellContext()
    const projects = await client.projects.list().catch(() => [])
    const activeId = useProjectStore.getState().activeProjectId
    const preferred =
      (activeId && projects.find((p) => p.id === activeId)) || projects[0]
    if (shell.observeEnabled && preferred) {
      throw redirect({
        to: "/observe/projects/$projectId",
        params: { projectId: preferred.id },
      })
    }
    return { session, shell }
  },
  component: ObserveHome,
})

function ObserveHome() {
  const { session, shell } = Route.useLoaderData()
  const observeEnabled = shell.observeEnabled

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      uiMode="observe"
      observeEnabled={observeEnabled}
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
            <Button size="sm" className="mt-4" render={<Link to="/" />}>
              Open Deploy
            </Button>
          </div>
        )}
      </PageContent>
    </AppShell>
  )
}
