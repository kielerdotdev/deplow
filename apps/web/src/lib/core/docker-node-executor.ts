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
  serviceId?: string
  serviceType?: "web" | "worker"
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

  proxyUpstream(
    nodeId: string,
    serviceName: string,
    containerPort = 80,
  ): string {
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
    const useSecure =
      options.secureRuntime !== false && !options.command?.length

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
    const { exposed, portBindings } = buildPortMappings(
      containerPort,
      options.publishPort,
    )
    const env = Object.entries(options.env ?? {}).map(([k, v]) => `${k}=${v}`)
    const labels = buildLabels(
      nodeId,
      serviceName,
      options,
      useSecure,
      this.runtimeLimits.runtime,
    )
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

  /** Remove a local image tag (best-effort; ignores missing). */
  async removeImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).remove({ force: true })
    } catch {
      // missing or in use
    }
  }

  async getContainerState(
    nodeId: string,
    serviceName: string,
  ): Promise<{ running: boolean; restartCount: number; status: string }> {
    const name = this.containerName(nodeId, serviceName)
    try {
      const inspect = await this.docker.getContainer(name).inspect()
      return {
        running: Boolean(inspect.State?.Running),
        restartCount: Number(inspect.RestartCount ?? 0),
        status: String(inspect.State?.Status ?? "unknown"),
      }
    } catch {
      return { running: false, restartCount: 0, status: "missing" }
    }
  }

  /**
   * Check whether a TCP port is accepting connections inside the container.
   * Railpack/runtime images often lack wget/nc and use dash as `sh` (no /dev/tcp).
   * Distroless / static binaries (e.g. http-echo) have no shell — fall back to a
   * host-side TCP probe against the container IP on the platform network.
   */
  async isPortListening(
    nodeId: string,
    serviceName: string,
    port: number,
  ): Promise<boolean> {
    // Prefer /proc + short-timeout tools. Skip `node` — Railpack mise shims can
    // stall or spam under read-only rootfs and hang docker exec streams.
    const script = [
      `port=${Number(port)}`,
      `hex=$(printf '%04X' "$port")`,
      `if grep -h ":"$hex /proc/net/tcp /proc/net/tcp6 2>/dev/null | awk '$4=="0A"{found=1} END{exit !found}'; then exit 0; fi`,
      `if command -v bash >/dev/null 2>&1; then bash -c "echo >/dev/tcp/127.0.0.1/$port" >/dev/null 2>&1 && exit 0; fi`,
      `command -v wget >/dev/null 2>&1 && wget -q -O- --timeout=1 http://127.0.0.1:$port/ >/dev/null 2>&1 && exit 0`,
      `command -v curl >/dev/null 2>&1 && curl -sf --max-time 1 http://127.0.0.1:$port/ >/dev/null 2>&1 && exit 0`,
      `command -v nc >/dev/null 2>&1 && nc -z -w 1 127.0.0.1 $port >/dev/null 2>&1 && exit 0`,
      `exit 1`,
    ].join("; ")
    const code = await this.execInService(nodeId, serviceName, [
      "sh",
      "-c",
      script,
    ])
    if (code === 0) return true
    return this.probeContainerPort(nodeId, serviceName, port)
  }

  private async probeContainerPort(
    nodeId: string,
    serviceName: string,
    port: number,
  ): Promise<boolean> {
    const name = this.containerName(nodeId, serviceName)
    try {
      const info = await this.docker.getContainer(name).inspect()
      const networks = info.NetworkSettings?.Networks ?? {}
      const ip =
        networks[this.platformNetwork]?.IPAddress ||
        Object.values(networks).find((n) => n?.IPAddress)?.IPAddress
      if (!ip) return false
      const net = await import("node:net")
      return await new Promise<boolean>((resolve) => {
        const socket = net.connect({ host: ip, port, timeout: 1500 }, () => {
          socket.destroy()
          resolve(true)
        })
        socket.on("error", () => resolve(false))
        socket.on("timeout", () => {
          socket.destroy()
          resolve(false)
        })
      })
    } catch {
      return false
    }
  }

  async httpGetInService(
    nodeId: string,
    serviceName: string,
    port: number,
    requestPath: string,
  ): Promise<{ ok: boolean; status: number }> {
    const path = requestPath.startsWith("/") ? requestPath : `/${requestPath}`
    const url = `http://127.0.0.1:${port}${path}`
    const script = [
      `url=${JSON.stringify(url)}`,
      `if command -v wget >/dev/null 2>&1; then`,
      `  code=$(wget -q -S -O /dev/null --timeout=3 "$url" 2>&1 | awk '/HTTP\\//{print $2; exit}')`,
      `  [ -n "$code" ] || exit 1`,
      `  echo "$code"`,
      `  exit 0`,
      `fi`,
      `if command -v curl >/dev/null 2>&1; then`,
      `  curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url"`,
      `  exit 0`,
      `fi`,
      `exit 1`,
    ].join("\n")
    const { code, stdout } = await this.execInServiceWithOutput(
      nodeId,
      serviceName,
      ["sh", "-c", script],
    )
    if (code !== 0) return { ok: false, status: 0 }
    const status = Number(stdout.trim().split("\n").pop() || "0")
    return { ok: status >= 200 && status < 500, status }
  }

  private async execInService(
    nodeId: string,
    serviceName: string,
    cmd: string[],
  ): Promise<number> {
    const { code } = await this.execInServiceWithOutput(
      nodeId,
      serviceName,
      cmd,
    )
    return code
  }

  private async execInServiceWithOutput(
    nodeId: string,
    serviceName: string,
    cmd: string[],
    timeoutMs = 8_000,
  ): Promise<{ code: number; stdout: string }> {
    const name = this.containerName(nodeId, serviceName)
    try {
      const container = this.docker.getContainer(name)
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
      })
      const stream = await exec.start({ hijack: true, stdin: false })
      const chunks: Buffer[] = []
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          stream.destroy()
          reject(new Error(`exec timed out after ${timeoutMs}ms`))
        }, timeoutMs)
        stream.on("data", (c: Buffer) => chunks.push(Buffer.from(c)))
        stream.on("end", () => {
          clearTimeout(timer)
          resolve()
        })
        stream.on("error", (err: Error) => {
          clearTimeout(timer)
          reject(err)
        })
      })
      const inspect = await exec.inspect()
      return {
        code: inspect.ExitCode ?? 1,
        stdout: demuxDockerLogs(Buffer.concat(chunks)),
      }
    } catch {
      return { code: 1, stdout: "" }
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
  if (options.serviceId) {
    labels["deplow.serviceId"] = options.serviceId
  }
  if (options.serviceType) {
    labels["deplow.type"] = options.serviceType
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
