import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import { AppShell } from "@/components/app-shell"
import { SettingsNav } from "@/components/settings/settings-nav"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/settings")({
  loader: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: "/login", search: { redirect: undefined } })
    const [shell, projects] = await Promise.all([
      loadShellContext(),
      client.projects.list(),
    ])
    return {
      session,
      shell,
      deployProjects: projects.map((p) => ({ id: p.id, name: p.name })),
    }
  },
  component: SettingsLayout,
})

function SettingsLayout() {
  const { session, shell, deployProjects } = Route.useLoaderData()

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      deployProjects={deployProjects}
    >
      <SettingsNav instanceAdmin={shell.instanceAdmin} />
      <Outlet />
    </AppShell>
  )
}
