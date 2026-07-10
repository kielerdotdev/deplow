import type {
  SpawnedServer,
  SpawnedServerStatus,
  SpawnOptions,
} from "@deplow/shared"

export type { SpawnedServer, SpawnedServerStatus, SpawnOptions }

/**
 * Abstraction for creating and destroying ad-hoc cloud servers.
 */
export interface ServerSpawner {
  provider: string

  spawn(options: SpawnOptions): Promise<SpawnedServer>
  destroy(serverId: string): Promise<void>
  getStatus(serverId: string): Promise<SpawnedServerStatus>
}
