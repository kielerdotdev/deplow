import { Suspense } from "react"
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import { AppShell } from "@/components/app-shell"
import { RoutePending, ShellPending } from "@/components/route-pending"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

/**
 * Layout for /observe/projects/$projectId/* — owns AppShell so child routes
 * (traces, logs, issues, …) do not remount chrome on every tab change.
 */
export const Route = createFileRoute("/observe/projects/$projectId")({
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const shell = await loadShellContext()
    // Ensure project observe row exists (best-effort).
    await client.observe.projects
      .enable({ projectId: params.projectId })
      .catch(() => null)
    return { session, shell }
  },
  pendingComponent: ShellPending,
  component: ObserveProjectLayout,
})

function ObserveProjectLayout() {
  const { session, shell } = Route.useLoaderData()

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      uiMode="observe"
      observeEnabled={shell.observeEnabled}
    >
      <Suspense fallback={<RoutePending />}>
        <Outlet />
      </Suspense>
    </AppShell>
  )
}
