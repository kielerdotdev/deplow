import { db, eq, spawnedServers } from "@deplow/db"

import {
  createServerSpawners,
  getServerSpawner,
  isHetznerConfigured,
  loadPlatformConfig,
} from "@/lib/core"

/** Destroy a Hetzner (or other) VM tracked in `spawned_servers`, then drop the row. */
export async function destroySpawnedServer(id: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(spawnedServers)
    .where(eq(spawnedServers.id, id))
  if (!row) return false

  if (row.externalId) {
    const spawners = createServerSpawners(loadPlatformConfig())
    try {
      const spawner = getServerSpawner(spawners, row.provider)
      if (row.provider === "hetzner" && !isHetznerConfigured()) {
        throw new Error(
          "Hetzner is not configured. Set DEPLOW_HETZNER_API_TOKEN to destroy servers.",
        )
      }
      await spawner.destroy(row.externalId)
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Unknown server spawner")
      ) {
        // Provider has no destroy implementation — drop DB row only.
      } else {
        throw error
      }
    }
  }

  await db.delete(spawnedServers).where(eq(spawnedServers.id, id))
  return true
}
