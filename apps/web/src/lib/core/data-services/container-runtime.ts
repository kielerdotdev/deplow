import Docker from "dockerode"

import type { PlatformConfig } from "../platform-config"

export type DataContainerKind = "postgres" | "redis"

export type DataContainerSpec = {
  kind: DataContainerKind
  projectId: string
  projectSlug: string
  image: string
  env: string[]
  cmd?: string[]
  containerPort: number
  /** Path inside container for the named volume mount */
  dataPath: string
}

export type RunningDataContainer = {
  containerName: string
  volumeName: string
  /** Docker DNS name on the platform network */
  runtimeHost: string
  runtimePort: number
  /** Host-published port for control-plane tools */
  operatorHost: string
  operatorPort: number
  containerId: string
}

/**
 * Create/start/remove dedicated data-plane containers (Postgres/Redis).
 * Uses runc + named volumes — not gVisor.
 */
export class DataContainerRuntime {
  private readonly docker: Docker
  private readonly network: string

  constructor(config: PlatformConfig) {
    this.docker = new Docker({ socketPath: config.dockerSocketPath })
    this.network = config.dockerNetwork
  }

  containerName(kind: DataContainerKind, slug: string): string {
    const safe = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-")
    return kind === "postgres" ? `hostrig-pg-${safe}` : `hostrig-redis-${safe}`
  }

  volumeName(kind: DataContainerKind, slug: string): string {
    return `${this.containerName(kind, slug)}-data`
  }

  async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect()
    } catch {
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(
          image,
          (err: Error | null, stream: NodeJS.ReadableStream) => {
            if (err) {
              reject(err)
              return
            }
            this.docker.modem.followProgress(stream, (e: Error | null) =>
              e ? reject(e) : resolve(),
            )
          },
        )
      })
    }
  }

  async create(spec: DataContainerSpec): Promise<RunningDataContainer> {
    const containerName = this.containerName(spec.kind, spec.projectSlug)
    const volumeName = this.volumeName(spec.kind, spec.projectSlug)

    await this.removeByName(containerName)
    await this.ensureImage(spec.image)

    try {
      await this.docker.createVolume({ Name: volumeName })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (!/already exists/i.test(msg)) throw error
    }

    const labels = {
      "hostrig.managed": "true",
      "hostrig.projectId": spec.projectId,
      "hostrig.kind": spec.kind,
      "hostrig.source": "dedicated-container",
      "hostrig.slug": spec.projectSlug,
    }

    const container = await this.docker.createContainer({
      name: containerName,
      Image: spec.image,
      Env: spec.env,
      ...(spec.cmd ? { Cmd: spec.cmd } : {}),
      Labels: labels,
      ExposedPorts: { [`${spec.containerPort}/tcp`]: {} },
      HostConfig: {
        Binds: [`${volumeName}:${spec.dataPath}`],
        PortBindings: {
          [`${spec.containerPort}/tcp`]: [
            { HostIp: "127.0.0.1", HostPort: "" },
          ],
        },
        RestartPolicy: { Name: "unless-stopped" },
        NetworkMode: this.network,
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [this.network]: {
            Aliases: [containerName],
          },
        },
      },
    })

    await container.start()
    const inspect = await container.inspect()
    const binding =
      inspect.NetworkSettings.Ports?.[`${spec.containerPort}/tcp`]?.[0]
    const assignedPort = Number(binding?.HostPort)
    if (!Number.isFinite(assignedPort) || assignedPort <= 0) {
      await container.remove({ force: true }).catch(() => undefined)
      throw new Error(`Failed to publish ${spec.kind} port on localhost`)
    }
    await this.waitHealthy(container.id, spec.kind, spec.env)

    return {
      containerName,
      volumeName,
      runtimeHost: containerName,
      runtimePort: spec.containerPort,
      operatorHost: "127.0.0.1",
      operatorPort: assignedPort,
      containerId: container.id,
    }
  }

  async destroy(
    kind: DataContainerKind,
    projectSlug: string,
    projectId?: string,
  ): Promise<void> {
    const containerName = this.containerName(kind, projectSlug)
    const volumeName = this.volumeName(kind, projectSlug)
    await this.removeByName(containerName)

    if (projectId) {
      const leftover = await this.docker.listContainers({
        all: true,
        filters: {
          label: [
            `hostrig.projectId=${projectId}`,
            `hostrig.kind=${kind}`,
            "hostrig.source=dedicated-container",
          ],
        },
      })
      for (const c of leftover) {
        await this.docker
          .getContainer(c.Id)
          .remove({ force: true })
          .catch(() => undefined)
      }
    }

    try {
      await this.docker.getVolume(volumeName).remove()
    } catch {
      // volume may already be gone
    }
  }

  /** Stop container, leave volume — used for PITR restore into data dir. */
  async stop(kind: DataContainerKind, projectSlug: string): Promise<void> {
    const name = this.containerName(kind, projectSlug)
    try {
      await this.docker.getContainer(name).stop({ t: 20 })
    } catch {
      // already stopped
    }
  }

  async start(kind: DataContainerKind, projectSlug: string): Promise<void> {
    const name = this.containerName(kind, projectSlug)
    await this.docker.getContainer(name).start()
  }

  async removeProjectDataContainers(projectId: string): Promise<void> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: [
          `hostrig.projectId=${projectId}`,
          "hostrig.source=dedicated-container",
        ],
      },
    })
    const volumes = new Set<string>()
    for (const c of containers) {
      const inspect = await this.docker
        .getContainer(c.Id)
        .inspect()
        .catch(() => null)
      if (inspect?.Mounts) {
        for (const m of inspect.Mounts) {
          if (m.Name) volumes.add(m.Name)
        }
      }
      await this.docker
        .getContainer(c.Id)
        .remove({ force: true })
        .catch(() => undefined)
    }
    for (const vol of volumes) {
      await this.docker
        .getVolume(vol)
        .remove()
        .catch(() => undefined)
    }
  }

  private async removeByName(name: string): Promise<void> {
    try {
      const existing = this.docker.getContainer(name)
      await existing.remove({ force: true })
    } catch {
      // not found
    }
  }

  private async waitHealthy(
    containerId: string,
    kind: DataContainerKind,
    env: string[],
  ): Promise<void> {
    const deadline = Date.now() + 90_000
    const container = this.docker.getContainer(containerId)
    const user =
      env.find((e) => e.startsWith("POSTGRES_USER="))?.split("=")[1] ??
      "postgres"
    const redisPassword =
      env.find((e) => e.startsWith("HOSTRIG_REDIS_PASSWORD="))?.split("=")[1] ??
      ""

    while (Date.now() < deadline) {
      try {
        const cmd =
          kind === "postgres"
            ? ["pg_isready", "-U", user]
            : [
                "redis-cli",
                ...(redisPassword ? ["-a", redisPassword] : []),
                "ping",
              ]
        const exec = await container.exec({
          Cmd: cmd,
          AttachStdout: true,
          AttachStderr: true,
        })
        const stream = await exec.start({ Detach: false })
        await new Promise<void>((resolve, reject) => {
          let out = ""
          stream.on("data", (c: Buffer) => {
            out += c.toString()
          })
          stream.on("error", reject)
          stream.on("end", () => {
            if (kind === "redis" && !/PONG/i.test(out)) {
              reject(new Error(out || "redis not ready"))
              return
            }
            resolve()
          })
        })
        const inspect = await exec.inspect()
        if (inspect.ExitCode === 0) return
      } catch {
        // retry
      }
      await sleep(500)
    }
    throw new Error(`Dedicated ${kind} container did not become ready in time`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
