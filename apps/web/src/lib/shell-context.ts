import { client } from "@/lib/orpc"

export async function loadShellContext() {
  const [me, organizations, activeOrganization, observeStatus] =
    await Promise.all([
      client.organizations.me(),
      client.organizations.list(),
      client.organizations.getActive().catch(() => null),
      client.observe.status().catch(() => null),
    ])
  return {
    me,
    organizations,
    activeOrganization,
    instanceAdmin: me.instanceAdmin,
    observeEnabled: observeStatus?.enabled === true,
  }
}
