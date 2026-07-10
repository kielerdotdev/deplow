import type {
  ServerSpawner,
  SpawnedServer,
  SpawnedServerStatus,
  SpawnOptions,
} from "./base"

/**
 * Hetzner Cloud spawner (stub).
 * Future: official Hetzner API / axios client.
 */
export class HetznerSpawner implements ServerSpawner {
  readonly provider = "hetzner"

  async spawn(_options: SpawnOptions): Promise<SpawnedServer> {
    throw new Error("HetznerSpawner.spawn is not implemented")
  }

  async destroy(_serverId: string): Promise<void> {
    throw new Error("HetznerSpawner.destroy is not implemented")
  }

  async getStatus(_serverId: string): Promise<SpawnedServerStatus> {
    throw new Error("HetznerSpawner.getStatus is not implemented")
  }
}
