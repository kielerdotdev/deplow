import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import { AppShell } from "@/components/app-shell"
import { SettingsNav } from "@/components/settings/settings-nav"
import { getSession } from "@/lib/auth.functions"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/settings")({
  loader: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: "/login", search: { redirect: undefined } })
    const shell = await loadShellContext()
    return {
      session,
      shell,
    }
  },
  component: SettingsLayout,
})

function SettingsLayout() {
  const { session, shell } = Route.useLoaderData()

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      observeEnabled={shell.observeEnabled}
    >
      <SettingsNav instanceAdmin={shell.instanceAdmin} />
      <Outlet />
    </AppShell>
  )
}
