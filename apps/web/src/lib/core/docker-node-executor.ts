import Docker from "dockerode"

import type { DeployOptions, NodeStatus } from "@deplow/shared"

import {
  buildUserAppHostConfig,
  missingRuntimeError,
  type AppRuntimeLimits,
} from "./host-config"
import type { DeployResult, NodeExecutor } from "./node-executor"
import type { PlatformConfig } from "./platform-config"

export interface DockerNodeRecord {
  id: string
  name: string
  host: string
}

export type DockerDeployOptions = DeployOptions & {
  projectId?: string
  command?: string[]
  entrypoint?: string[]
  secureRuntime?: boolean
  readOnlyRootfs?: boolean
}

/**
 * Local Docker socket executor for registered docker nodes.
 * `nodeId` is the control-plane id; containers are labeled with it.
 */
export class DockerNodeExecutor implements NodeExecutor {
  readonly provider = "docker"
  private readonly docker: Docker
  private readonly platformNetwork: string
  private readonly runtimeLimits: AppRuntimeLimits
  private readonly runtimeRequired: boolean
  private runtimeAvailableCache: boolean | null = null

  constructor(
    config: PlatformConfig,
    private readonly resolveNode: (
      nodeId: string,
    ) => Promise<DockerNodeRecord | null>,
  ) {
    this.docker = new Docker({ socketPath: config.dockerSocketPath })
    this.platformNetwork = config.dockerNetwork
    this.runtimeLimits = {
      runtime: config.appRuntime,
      memoryBytes: config.appMemoryBytes,
      nanoCpus: config.appNanoCpus,
      readOnlyRootfs: config.appReadOnlyRootfs,
    }
    this.runtimeRequired = config.appRuntimeRequired
  }

  containerName(nodeId: string, serviceName: string): string {
    return `deplow-${nodeId.slice(0, 8)}-${serviceName}`.toLowerCase()
  }

  proxyUpstream(nodeId: string, serviceName: string, containerPort = 80): string {
    return `${this.containerName(nodeId, serviceName)}:${containerPort}`
  }

  async deployApp(
    nodeId: string,
    options: DockerDeployOptions,
  ): Promise<DeployResult> {
    const node = await this.resolveNode(nodeId)
    if (!node) throw new Error(`Node not found: ${nodeId}`)

    const serviceName = options.serviceName ?? "app"
    const name = this.containerName(nodeId, serviceName)
    const useSecure = options.secureRuntime !== false && !options.command?.length

    if (useSecure) {
      await this.assertRuntimeAvailable()
    }

    if (options.dockerCompose) {
      throw new Error(
        "Docker Compose deploy is not supported; pass options.image or build from source",
      )
    }
    if (!options.image) {
      throw new Error("DeployOptions.image is required")
    }

    await this.removeExistingContainer(name)
    await this.ensureImageAvailable(options.image)

    const containerPort = options.containerPort ?? 80
    const { exposed, portBindings } = buildPortMappings(containerPort, options.publishPort)
    const env = Object.entries(options.env ?? {}).map(([k, v]) => `${k}=${v}`)
    const labels = buildLabels(nodeId, serviceName, options, useSecure, this.runtimeLimits.runtime)
    const hostConfig = useSecure
      ? buildUserAppHostConfig({
          runtime: this.runtimeLimits,
          networkMode: this.platformNetwork,
          portBindings,
          restartPolicyName: "unless-stopped",
          readOnlyRootfs: options.readOnlyRootfs,
        })
      : buildRuncHostConfig(this.platformNetwork, portBindings, options)

    warnOnInsecureRuntime(useSecure, this.runtimeLimits.runtime)

    const container = await this.docker.createContainer({
      name,
      Image: options.image,
      Env: env,
      Labels: labels,
      ...(options.command ? { Cmd: options.command } : {}),
      ...(options.entrypoint ? { Entrypoint: options.entrypoint } : {}),
      ExposedPorts: exposed,
      HostConfig: hostConfig,
    })

    await container.start()
    return { containerId: container.id, serviceName }
  }

  async assertRuntimeAvailable(): Promise<void> {
    if (this.runtimeAvailableCache === true) return
    if (this.runtimeLimits.runtime === "runc") {
      this.runtimeAvailableCache = true
      return
    }

    const available = await this.isRuntimeAvailable(this.runtimeLimits.runtime)
    if (available) {
      this.runtimeAvailableCache = true
      return
    }

    if (this.runtimeRequired) {
      throw missingRuntimeError(this.runtimeLimits.runtime)
    }

    console.warn(
      `[deplow] runtime ${this.runtimeLimits.runtime} missing; DEPLOW_APP_RUNTIME_REQUIRED=false — continuing without preflight fail`,
    )
  }

  async isRuntimeAvailable(runtime: string): Promise<boolean> {
    try {
      const info = await this.docker.info()
      const runtimes = (info as { Runtimes?: Record<string, unknown> }).Runtimes
      if (!runtimes) return false
      return Object.prototype.hasOwnProperty.call(runtimes, runtime)
    } catch {
      return false
    }
  }

  async getRuntimeStatus(): Promise<{
    appRuntime: string
    appRuntimeAvailable: boolean
    appRuntimeRequired: boolean
  }> {
    const appRuntimeAvailable = await this.isRuntimeAvailable(
      this.runtimeLimits.runtime,
    )
    return {
      appRuntime: this.runtimeLimits.runtime,
      appRuntimeAvailable,
      appRuntimeRequired: this.runtimeRequired,
    }
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
    await this.pullImage("alpine:3.20")
    const execContainer = await this.docker.createContainer({
      Image: "alpine:3.20",
      Cmd: ["sh", "-c", command],
      HostConfig: { AutoRemove: true },
    })
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
      const runtime = await this.getRuntimeStatus()
      return {
        online: true,
        docker: "running",
        message: runtimeLabel(runtime),
        ...runtime,
      } as NodeStatus
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
      filters: { label: [`deplow.projectId=${projectId}`] },
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

  // ── internal helpers ──────────────────────────────────────────

  private async removeExistingContainer(name: string): Promise<void> {
    try {
      await this.docker.getContainer(name).remove({ force: true })
    } catch {
      // container doesn't exist — fine
    }
  }

  private async ensureImageAvailable(image: string): Promise<void> {
    if (image.startsWith("deplow/")) {
      const localAvailable = await this.isLocalImagePresent(image)
      if (localAvailable) return
      try {
        await this.pullImage(image)
        return
      } catch {
        throw new Error(
          `Local image not found: ${image}. Build may have failed to load into Docker.`,
        )
      }
    }
    await this.pullImage(image)
  }

  private async isLocalImagePresent(image: string): Promise<boolean> {
    try {
      await this.docker.getImage(image).inspect()
      return true
    } catch {
      return false
    }
  }

  private async pullImage(image: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(
        image,
        (err: Error | null, streamable: NodeJS.ReadableStream) => {
          if (err) return reject(err)
          this.docker.modem.followProgress(streamable, (e: Error | null) => {
            if (e) reject(e)
            else resolve()
          })
        },
      )
    })
  }
}

// ── module-level helpers ─────────────────────────────────────────

function buildPortMappings(
  containerPort: number,
  publishPort?: number,
): {
  exposed: Record<string, object>
  portBindings: Record<string, Array<{ HostPort: string }>>
} {
  const exposed: Record<string, object> = { [`${containerPort}/tcp`]: {} }
  const portBindings: Record<string, Array<{ HostPort: string }>> = {}
  if (publishPort) {
    portBindings[`${containerPort}/tcp`] = [{ HostPort: String(publishPort) }]
  }
  return { exposed, portBindings }
}

function buildLabels(
  nodeId: string,
  serviceName: string,
  options: DockerDeployOptions,
  useSecure: boolean,
  runtime: string,
): Record<string, string> {
  const labels: Record<string, string> = {
    "deplow.managed": "true",
    "deplow.nodeId": nodeId,
    "deplow.service": serviceName,
    "deplow.runtime": useSecure ? runtime : "runc",
  }
  if (options.projectId) {
    labels["deplow.projectId"] = options.projectId
  }
  return labels
}

function buildRuncHostConfig(
  network: string,
  portBindings: Record<string, Array<{ HostPort: string }>>,
  options: DockerDeployOptions,
): Record<string, unknown> {
  return {
    PortBindings: portBindings,
    RestartPolicy: {
      Name: options.command?.length ? "no" : "unless-stopped",
    },
    NetworkMode: network,
  }
}

function warnOnInsecureRuntime(useSecure: boolean, runtime: string): void {
  if (useSecure && runtime === "runc") {
    console.warn(
      "[deplow] DEPLOW_APP_RUNTIME=runc — user apps are NOT sandboxed with gVisor",
    )
  }
}

function runtimeLabel(runtime: {
  appRuntime: string
  appRuntimeAvailable: boolean
}): string {
  const name =
    runtime.appRuntime === "runsc" || runtime.appRuntime.startsWith("runsc")
      ? `gVisor (${runtime.appRuntime})`
      : runtime.appRuntime === "runc"
        ? "runc (not sandboxed)"
        : runtime.appRuntime
  if (!runtime.appRuntimeAvailable) {
    return `Daemon OK · ${name} missing — install before deploy`
  }
  return `Daemon OK · app runtime ${name}`
}

function demuxDockerLogs(buffer: Buffer): string {
  if (buffer.length === 0) return ""
  const asText = buffer.toString("utf8")
  if (!asText.includes("\u0000") && buffer[0]! > 8) {
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