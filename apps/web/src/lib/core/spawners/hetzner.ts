import type {
  ServerSpawner,
  SpawnedServer,
  SpawnedServerStatus,
  SpawnOptions,
} from "./base"
import type { HetznerCloudClient } from "./hetzner-client"

export type HetznerSpawnerDefaults = {
  location: string
  serverType: string
  image: string
  sshKeys?: string[]
  /** Max wait for public IPv4 after create (ms). */
  ipWaitMs?: number
  ipPollIntervalMs?: number
  sleep?: (ms: number) => Promise<void>
}

function mapHetznerStatus(status: string): SpawnedServerStatus {
  if (status === "running") return "running"
  if (
    status === "initializing" ||
    status === "starting" ||
    status === "migrating" ||
    status === "rebuilding"
  ) {
    return "starting"
  }
  return "stopped"
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Hetzner Cloud spawner — creates a VM with caller-supplied cloud-init (k3s). */
export class HetznerSpawner implements ServerSpawner {
  readonly provider = "hetzner"

  constructor(
    private readonly client: HetznerCloudClient,
    private readonly defaults: HetznerSpawnerDefaults,
  ) {}

  async spawn(options: SpawnOptions): Promise<SpawnedServer> {
    const location = options.location?.trim() || this.defaults.location
    const serverType = options.serverType?.trim() || this.defaults.serverType
    const userData = options.userData?.trim()
    if (!userData) {
      throw new Error("HetznerSpawner.spawn requires userData (k3s cloud-init)")
    }

    const labels: Record<string, string> = {
      "deplow.spawned": "true",
      ...(options.labels ?? {}),
    }

    const created = await this.client.createServer({
      name: options.name,
      serverType,
      image: this.defaults.image,
      location,
      userData,
      labels,
      sshKeys: this.defaults.sshKeys,
    })

    const withIp = await this.waitForIpv4(created.id, created.ipv4)
    return {
      id: String(withIp.id),
      name: options.name,
      ip: withIp.ipv4 ?? "0.0.0.0",
      status: mapHetznerStatus(withIp.status),
      provider: this.provider,
      metadata: {
        hetznerServerId: withIp.id,
        serverType,
        location,
        image: this.defaults.image,
      },
    }
  }

  async destroy(serverId: string): Promise<void> {
    const id = Number(serverId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error(`Invalid Hetzner server id: ${serverId}`)
    }
    await this.client.deleteServer(id)
  }

  async getStatus(serverId: string): Promise<SpawnedServerStatus> {
    const id = Number(serverId)
    if (!Number.isFinite(id) || id <= 0) return "stopped"
    try {
      const server = await this.client.getServer(id)
      return mapHetznerStatus(server.status)
    } catch {
      return "stopped"
    }
  }

  private async waitForIpv4(
    id: number,
    initial: string | null,
  ): Promise<{ id: number; ipv4: string | null; status: string }> {
    if (initial) {
      return { id, ipv4: initial, status: "running" }
    }
    const waitMs = this.defaults.ipWaitMs ?? 60_000
    const interval = this.defaults.ipPollIntervalMs ?? 2_000
    const sleep = this.defaults.sleep ?? defaultSleep
    const deadline = Date.now() + waitMs
    let last = { id, ipv4: null as string | null, status: "initializing" }
    while (Date.now() < deadline) {
      await sleep(interval)
      last = await this.client.getServer(id)
      if (last.ipv4) return last
    }
    return last
  }
}
