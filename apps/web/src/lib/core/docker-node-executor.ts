import Docker from "dockerode"

import type { DeployOptions, NodeStatus } from "@deplow/shared"

import type { DeployResult, NodeExecutor } from "./node-executor"
import type { PlatformConfig } from "./platform-config"

export interface DockerNodeRecord {
  id: string
  name: string
  host: string
}

export type DockerDeployOptions = DeployOptions & {
  projectId?: string
  /** Optional command override (e.g. connectivity probe) */
  command?: string[]
  entrypoint?: string[]
}

/**
 * Local Docker socket executor for registered docker nodes.
 * `nodeId` is the control-plane id; containers are labeled with it.
 */
export class DockerNodeExecutor implements NodeExecutor {
  readonly provider = "docker"
  private readonly docker: Docker
  private readonly platformNetwork: string

  constructor(
    config: PlatformConfig,
    private readonly resolveNode: (
      nodeId: string,
    ) => Promise<DockerNodeRecord | null>,
  ) {
    this.docker = new Docker({ socketPath: config.dockerSocketPath })
    this.platformNetwork = config.dockerNetwork
  }

  private containerName(nodeId: string, serviceName: string): string {
    return `deplow-${nodeId.slice(0, 8)}-${serviceName}`.toLowerCase()
  }

  async deployApp(
    nodeId: string,
    options: DockerDeployOptions,
  ): Promise<DeployResult> {
    const node = await this.resolveNode(nodeId)
    if (!node) throw new Error(`Node not found: ${nodeId}`)

    const serviceName = options.serviceName ?? "app"
    const name = this.containerName(nodeId, serviceName)

    try {
      const existing = this.docker.getContainer(name)
      await existing.remove({ force: true })
    } catch {
      // not found
    }

    if (options.dockerCompose) {
      throw new Error(
        "Docker Compose deploy is not supported; pass options.image or build from source",
      )
    }

    if (!options.image) {
      throw new Error("DeployOptions.image is required")
    }

    if (!options.image.startsWith("deplow/")) {
      await this.pullImage(options.image)
    } else {
      try {
        await this.docker.getImage(options.image).inspect()
      } catch {
        try {
          await this.pullImage(options.image)
        } catch {
          throw new Error(
            `Local image not found: ${options.image}. Build may have failed to load into Docker.`,
          )
        }
      }
    }

    const containerPort = options.containerPort ?? 80
    const publishPort = options.publishPort
    const exposed: Record<string, object> = {
      [`${containerPort}/tcp`]: {},
    }
    const portBindings: Record<string, Array<{ HostPort: string }>> = {}
    if (publishPort) {
      portBindings[`${containerPort}/tcp`] = [{ HostPort: String(publishPort) }]
    }

    const env = Object.entries(options.env ?? {}).map(([k, v]) => `${k}=${v}`)

    const labels: Record<string, string> = {
      "deplow.managed": "true",
      "deplow.nodeId": nodeId,
      "deplow.service": serviceName,
    }
    if (options.projectId) {
      labels["deplow.projectId"] = options.projectId
    }

    const network = this.platformNetwork

    const container = await this.docker.createContainer({
      name,
      Image: options.image,
      Env: env,
      Labels: labels,
      ...(options.command ? { Cmd: options.command } : {}),
      ...(options.entrypoint ? { Entrypoint: options.entrypoint } : {}),
      ExposedPorts: exposed,
      HostConfig: {
        PortBindings: portBindings,
        // One-shot command probes should not restart forever
        RestartPolicy: {
          Name: options.command?.length ? "no" : "unless-stopped",
        },
        // Join platform compose network so DATABASE_URL/REDIS_URL/S3_* with
        // service DNS (postgres/redis/minio) resolve — not 127.0.0.1 host ports.
        NetworkMode: network,
      },
    })

    await container.start()
    return { containerId: container.id, serviceName }
  }

  async getLogs(nodeId: string, serviceName = "app"): Promise<string> {
    const name = this.containerName(nodeId, serviceName)
    const container = this.docker.getContainer(name)
    const buffer = await container.logs({
      stdout: true,
      stderr: true,
      tail: 200,
      timestamps: true,
    })
    return demuxDockerLogs(buffer)
  }

  async exec(nodeId: string, command: string): Promise<string> {
    void nodeId
    const execContainer = await this.docker.createContainer({
      Image: "alpine:3.20",
      Cmd: ["sh", "-c", command],
      HostConfig: { AutoRemove: true },
    })
    await this.pullImage("alpine:3.20")
    const stream = await execContainer.attach({
      stream: true,
      stdout: true,
      stderr: true,
    })
    await execContainer.start()
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c: Buffer) => chunks.push(Buffer.from(c)))
      stream.on("end", () => resolve())
      stream.on("error", reject)
    })
    return demuxDockerLogs(Buffer.concat(chunks))
  }

  async getStatus(nodeId: string): Promise<NodeStatus> {
    void nodeId
    try {
      await this.docker.ping()
      return { online: true, docker: "running", message: "Docker daemon OK" }
    } catch (error) {
      return {
        online: false,
        docker: "stopped",
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async stopApp(nodeId: string, serviceName: string): Promise<void> {
    const name = this.containerName(nodeId, serviceName)
    try {
      await this.docker.getContainer(name).stop({ t: 10 })
    } catch {
      // already stopped
    }
  }

  async removeApp(nodeId: string, serviceName: string): Promise<void> {
    const name = this.containerName(nodeId, serviceName)
    try {
      await this.docker.getContainer(name).remove({ force: true })
    } catch {
      // missing
    }
  }

  async removeProjectContainers(projectId: string): Promise<number> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: [`deplow.projectId=${projectId}`],
      },
    })
    let removed = 0
    for (const c of containers) {
      try {
        await this.docker.getContainer(c.Id).remove({ force: true })
        removed++
      } catch {
        // ignore
      }
    }
    return removed
  }

  private async pullImage(image: string): Promise<void> {
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

function demuxDockerLogs(buffer: Buffer): string {
  if (buffer.length === 0) return ""
  const asText = buffer.toString("utf8")
  if (!asText.includes("\u0000") && buffer[0] > 8) {
    return asText
  }

  let offset = 0
  const parts: string[] = []
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset + 4)
    offset += 8
    parts.push(buffer.subarray(offset, offset + size).toString("utf8"))
    offset += size
  }
  return parts.join("") || asText
}
