import type { PlatformConfig } from "../platform-config"
import type { ServerSpawner } from "./base"
import { DockerSpawner } from "./docker"
import { HetznerSpawner } from "./hetzner"

export function createServerSpawners(
  config: PlatformConfig,
): Record<string, ServerSpawner> {
  return {
    docker: new DockerSpawner(config),
    hetzner: new HetznerSpawner(),
  }
}

export function getServerSpawner(
  spawners: Record<string, ServerSpawner>,
  provider = "docker",
): ServerSpawner {
  const spawner = spawners[provider]
  if (!spawner) {
    throw new Error(`Unknown server spawner provider: ${provider}`)
  }
  return spawner
}

export function listServerSpawnerProviders(
  spawners: Record<string, ServerSpawner>,
): string[] {
  return Object.keys(spawners)
}
