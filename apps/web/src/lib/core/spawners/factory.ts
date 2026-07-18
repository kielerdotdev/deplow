import { env } from "@/lib/env"

import type { PlatformConfig } from "../platform-config"
import type { ServerSpawner } from "./base"
import { DockerSpawner } from "./docker"
import { HetznerSpawner } from "./hetzner"
import {
  createHetznerCloudClient,
  createUnconfiguredHetznerCloudClient,
} from "./hetzner-client"

export function isHetznerConfigured(): boolean {
  return Boolean(env.hetznerApiToken)
}

export function createServerSpawners(
  config: PlatformConfig,
): Record<string, ServerSpawner> {
  const token = env.hetznerApiToken
  const client = token
    ? createHetznerCloudClient(token)
    : createUnconfiguredHetznerCloudClient()

  return {
    docker: new DockerSpawner(config),
    hetzner: new HetznerSpawner(client, {
      location: env.hetznerLocation,
      serverType: env.hetznerServerType,
      image: env.hetznerImage,
      sshKeys: env.hetznerSshKeys,
    }),
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
