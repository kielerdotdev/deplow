import { requireConnectedKubeconfig } from "@/lib/k8s/cluster-store"

import { createNetbirdClient } from "./client"
import {
  decryptPat,
  getNetbirdServiceMap,
  loadNetbirdEdgeRow,
  upsertNetbirdServiceMap,
} from "./store"
import { resolveTraefikPeerPort } from "./traefik-port"

/**
 * Ensure a NetBird HTTP reverse-proxy service exists for hostname → peer:Traefik.
 * Called after a successful k3s web deploy when edgeMode is netbird.
 */
export async function syncNetbirdService(input: {
  hostname: string
  serviceId?: string
}): Promise<{ netbirdServiceId: string; created: boolean; port: number }> {
  const row = await loadNetbirdEdgeRow()
  if (!row?.netbirdPatEncrypted || !row.netbirdManagementUrl) {
    throw new Error("NetBird is not connected (missing credentials).")
  }
  if (!row.netbirdPeerId) {
    throw new Error("NetBird peer is not registered yet.")
  }
  if (row.netbirdStatus !== "connected") {
    throw new Error(
      `NetBird edge status is ${row.netbirdStatus}${
        row.netbirdStatusMessage ? `: ${row.netbirdStatusMessage}` : ""
      }`,
    )
  }

  const kubeconfigYaml = await requireConnectedKubeconfig()
  const { port } = await resolveTraefikPeerPort(kubeconfigYaml)

  const client = createNetbirdClient(
    row.netbirdManagementUrl,
    decryptPat(row.netbirdPatEncrypted),
  )
  const hostname = input.hostname.trim().toLowerCase()
  const existing = await getNetbirdServiceMap(hostname)

  const payload = {
    name: hostname,
    domain: hostname,
    peerId: row.netbirdPeerId,
    port,
  }

  if (existing) {
    try {
      const updated = await client.updateHttpService(
        existing.netbirdServiceId,
        payload,
      )
      await upsertNetbirdServiceMap({
        hostname,
        serviceId: input.serviceId,
        netbirdServiceId: updated.id || existing.netbirdServiceId,
      })
      return {
        netbirdServiceId: updated.id || existing.netbirdServiceId,
        created: false,
        port,
      }
    } catch {
      // fall through to create if update failed (deleted remotely)
    }
  }

  // Prefer update of remote service with same domain if map missing
  const remote = await client.listServices()
  const match = remote.find(
    (s) => s.domain?.toLowerCase() === hostname || s.name === hostname,
  )
  if (match) {
    const updated = await client.updateHttpService(match.id, payload)
    await upsertNetbirdServiceMap({
      hostname,
      serviceId: input.serviceId,
      netbirdServiceId: updated.id || match.id,
    })
    return { netbirdServiceId: updated.id || match.id, created: false, port }
  }

  const created = await client.createHttpService(payload)
  await upsertNetbirdServiceMap({
    hostname,
    serviceId: input.serviceId,
    netbirdServiceId: created.id,
  })
  return { netbirdServiceId: created.id, created: true, port }
}
