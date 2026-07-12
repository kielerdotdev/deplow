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
  /** Optional command override (e.g. connectivity probe) */
  command?: string[]
  entrypoint?: string[]
  /**
   * When true (default for user apps), apply gVisor + hardened HostConfig.
   * Set false for ephemeral probe helpers that should stay on runc.
   */
  secureRuntime?: boolean
  /** Opt out of read-only rootfs for images that need a writable root */
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

  /** Container name used for deploy / proxy upstream. */
  containerName(nodeId: string, serviceName: string): string {
    return `deplow-${nodeId.slice(0, 8)}-${serviceName}`.toLowerCase()
  }

  /**
   * Upstream host:port for the platform reverse proxy (Docker network DNS).
   */
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
      "deplow.runtime": useSecure ? this.runtimeLimits.runtime : "runc",
    }
    if (options.projectId) {
      labels["deplow.projectId"] = options.projectId
    }

    const network = this.platformNetwork

    const hostConfig = useSecure
      ? buildUserAppHostConfig({
          runtime: this.runtimeLimits,
          networkMode: network,
          portBindings,
          restartPolicyName: "unless-stopped",
          readOnlyRootfs: options.readOnlyRootfs,
        })
      : {
          PortBindings: portBindings,
          RestartPolicy: {
            Name: options.command?.length ? "no" : "unless-stopped",
          },
          NetworkMode: network,
        }

    if (
      useSecure &&
      this.runtimeLimits.runtime !== "runc" &&
      this.runtimeLimits.runtime !== "io.containerd.runc.v2"
    ) {
      // intentional; runsc is the secure default
    } else if (useSecure && this.runtimeLimits.runtime === "runc") {
      console.warn(
        "[deplow] DEPLOW_APP_RUNTIME=runc — user apps are NOT sandboxed with gVisor",
      )
    }

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

  /**
   * Preflight: ensure the configured app runtime is registered with Docker.
   * Cached for process lifetime after first successful check.
   */
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
    // Probe helpers use default runc — not user app sandbox
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
        message: `Docker daemon OK · app runtime ${runtime.appRuntime}${runtime.appRuntimeAvailable ? "" : " (missing)"}`,
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
    const script = [
      `port=${Number(port)}`,
      `hex=$(printf '%04X' "$port")`,
      // /proc is always available; 0A = TCP_LISTEN
      `if grep -h ":"$hex /proc/net/tcp /proc/net/tcp6 2>/dev/null | awk '$4=="0A"{found=1} END{exit !found}'; then exit 0; fi`,
      // bash /dev/tcp (not available in dash)
      `if command -v bash >/dev/null 2>&1; then bash -c "echo >/dev/tcp/127.0.0.1/$port" >/dev/null 2>&1 && exit 0; fi`,
      // Node is present in Node/Railpack images
      `if command -v node >/dev/null 2>&1; then node -e "require('net').connect($port,'127.0.0.1',()=>process.exit(0)).on('error',()=>process.exit(1))" >/dev/null 2>&1 && exit 0; fi`,
      `command -v wget >/dev/null 2>&1 && wget -q -O- --timeout=1 http://127.0.0.1:$port/ >/dev/null 2>&1 && exit 0`,
      `command -v curl >/dev/null 2>&1 && curl -sf --max-time 1 http://127.0.0.1:$port/ >/dev/null 2>&1 && exit 0`,
      `command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 $port >/dev/null 2>&1 && exit 0`,
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
        stream.on("data", (c: Buffer) => chunks.push(Buffer.from(c)))
        stream.on("end", () => resolve())
        stream.on("error", reject)
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
