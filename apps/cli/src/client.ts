import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"

import type { CliConfig } from "./config"

/**
 * Untyped oRPC client over /api/rpc with MCP operator PAT.
 * Procedure paths match apps/web router (projects.list, deployments.logs, …).
 */
export type HostrigClient = {
  health: () => Promise<{ ok: true; time: string }>
  organizations: {
    me: () => Promise<unknown>
  }
  projects: {
    list: () => Promise<unknown>
    get: (input: { id: string }) => Promise<unknown>
    create: (input: { name: string }) => Promise<unknown>
    destroy: (input: { id: string }) => Promise<unknown>
  }
  services: {
    list: (input: { projectId: string }) => Promise<unknown>
  }
  deployments: {
    get: (input: { id: string }) => Promise<unknown>
    logs: (input: {
      serviceId: string
      deploymentId?: string
      since?: string
    }) => Promise<unknown>
    rollback: (input: {
      serviceId: string
      deploymentId?: string
    }) => Promise<unknown>
    create: (input: Record<string, unknown>) => Promise<unknown>
  }
}

export function createClient(config: CliConfig): HostrigClient {
  const link = new RPCLink({
    url: `${config.url}/api/rpc`,
    headers: () => ({
      Authorization: `Bearer ${config.token}`,
    }),
  })
  return createORPCClient(link) as HostrigClient
}
