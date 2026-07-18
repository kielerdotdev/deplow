import { eq, db, serviceHostnames } from "@hostrig/db"

import { createNetbirdClient } from "./client"
import {
  decryptPat,
  deleteNetbirdServiceMapById,
  listNetbirdServiceMapsForHostnames,
  listNetbirdServiceMapsForService,
  loadNetbirdEdgeRow,
} from "./store"

/**
 * Remove NetBird reverse-proxy services mapped to a Hostrig service.
 * Best-effort: missing credentials / remote deletes never throw.
 */
export async function unsyncNetbirdForService(
  serviceId: string,
): Promise<{ removed: number }> {
  const hosts = await db
    .select({ hostname: serviceHostnames.hostname })
    .from(serviceHostnames)
    .where(eq(serviceHostnames.serviceId, serviceId))

  const mapped = new Map<
    string,
    { id: string; hostname: string; netbirdServiceId: string }
  >()
  for (const row of await listNetbirdServiceMapsForService(serviceId)) {
    mapped.set(row.netbirdServiceId, row)
  }
  for (const row of await listNetbirdServiceMapsForHostnames(
    hosts.map((h) => h.hostname),
  )) {
    mapped.set(row.netbirdServiceId, row)
  }

  if (mapped.size === 0) return { removed: 0 }

  const edge = await loadNetbirdEdgeRow()
  let client: ReturnType<typeof createNetbirdClient> | null = null
  if (edge?.netbirdPatEncrypted && edge.netbirdManagementUrl) {
    try {
      client = createNetbirdClient(
        edge.netbirdManagementUrl,
        decryptPat(edge.netbirdPatEncrypted),
      )
    } catch {
      client = null
    }
  }

  let removed = 0
  for (const row of mapped.values()) {
    if (client) {
      try {
        await client.deleteService(row.netbirdServiceId)
      } catch {
        // Remote may already be gone
      }
    }
    await deleteNetbirdServiceMapById(row.id)
    removed += 1
  }
  return { removed }
}
