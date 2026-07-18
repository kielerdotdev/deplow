import Docker from "dockerode"

import type {
  ServerSpawner,
  SpawnedServer,
  SpawnedServerStatus,
  SpawnOptions,
} from "./base"
import type { PlatformConfig } from "../platform-config"

/**
 * Ephemeral "build server" simulated as a long-running Alpine container.
 * Used for local E2E without Hetzner API credentials.
 */
export class DockerSpawner implements ServerSpawner {
  readonly provider = "docker"
  private readonly docker: Docker

  constructor(config: PlatformConfig) {
    this.docker = new Docker({ socketPath: config.dockerSocketPath })
  }

  async spawn(options: SpawnOptions): Promise<SpawnedServer> {
    const id = crypto.randomUUID()
    const name = `hostrig-spawn-${options.name}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")

    try {
      const existing = this.docker.getContainer(name)
      await existing.remove({ force: true })
    } catch {
      // ok
    }

    await this.pull("alpine:3.20")
    const container = await this.docker.createContainer({
      name,
      Image: "alpine:3.20",
      Cmd: ["sleep", String((options.ttlMinutes ?? 60) * 60)],
      Labels: {
        "hostrig.spawned": "true",
        "hostrig.spawnId": id,
        ...(options.labels ?? {}),
      },
      HostConfig: { AutoRemove: false },
    })
    await container.start()
    const info = await container.inspect()
    const networks = info.NetworkSettings?.Networks ?? {}
    const firstNetwork = Object.values(networks)[0] as
      | { IPAddress?: string }
      | undefined
    const ip = firstNetwork?.IPAddress || "127.0.0.1"

    return {
      id,
      name: options.name,
      ip,
      status: "running",
      provider: this.provider,
      metadata: {
        containerId: container.id,
        containerName: name,
        serverType: options.serverType,
      },
    }
  }

  async destroy(serverId: string): Promise<void> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: [`hostrig.spawnId=${serverId}`],
      },
    })
    for (const c of containers) {
      try {
        await this.docker.getContainer(c.Id).remove({ force: true })
      } catch {
        // ignore
      }
    }
  }

  async getStatus(serverId: string): Promise<SpawnedServerStatus> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: [`hostrig.spawnId=${serverId}`],
      },
    })
    if (containers.length === 0) return "stopped"
    const state = containers[0]?.State
    if (state === "running") return "running"
    if (state === "created" || state === "restarting") return "starting"
    return "stopped"
  }

  private async pull(image: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(
        image,
        (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err)
          this.docker.modem.followProgress(stream, (e: Error | null) => {
            if (e) reject(e)
            else resolve()
          })
        },
      )
    })
  }
}
