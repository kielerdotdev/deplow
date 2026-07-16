/**
 * Hardened Docker HostConfig for user app containers (gVisor by default).
 * Pure construction — no Docker client imports.
 */

export interface AppRuntimeLimits {
  /** OCI runtime name, e.g. "runsc" or "runc" */
  runtime: string
  memoryBytes: number
  nanoCpus: number
  /** Default true — opt out via deploy options when an image needs a writable root */
  readOnlyRootfs: boolean
}

export interface UserAppHostConfigInput {
  runtime: AppRuntimeLimits
  networkMode: string
  portBindings?: Record<string, Array<{ HostPort: string }>>
  /** One-shot probes should not restart forever */
  restartPolicyName?: "no" | "unless-stopped"
  readOnlyRootfs?: boolean
}

/**
 * Build the HostConfig object passed to docker.createContainer for user apps.
 * NEVER sets Privileged, host network, or docker.sock binds.
 */
export function buildUserAppHostConfig(input: UserAppHostConfigInput): {
  Runtime: string
  NetworkMode: string
  PortBindings: Record<string, Array<{ HostPort: string }>>
  RestartPolicy: { Name: string }
  CapDrop: string[]
  SecurityOpt: string[]
  ReadonlyRootfs: boolean
  Tmpfs: Record<string, string>
  Memory: number
  NanoCpus: number
} {
  const readOnly = input.readOnlyRootfs ?? input.runtime.readOnlyRootfs

  return {
    Runtime: input.runtime.runtime,
    NetworkMode: input.networkMode,
    PortBindings: input.portBindings ?? {},
    RestartPolicy: {
      Name: input.restartPolicyName ?? "unless-stopped",
    },
    CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges:true"],
    ReadonlyRootfs: readOnly,
    Tmpfs: {
      // Home/config/cache redirected here via HOME + XDG_* (see injectDeployEnv)
      "/tmp": "rw,noexec,nosuid,size=128m",
    },
    Memory: input.runtime.memoryBytes,
    NanoCpus: input.runtime.nanoCpus,
  }
}

/** Actionable error when the configured runtime is missing from the daemon. */
export function missingRuntimeError(runtime: string): Error {
  if (runtime === "runsc" || runtime.startsWith("runsc")) {
    return new Error(
      `gVisor runtime "${runtime}" is not installed. Install runsc (see README / docs/secure-runtime.md), then: sudo runsc install && sudo systemctl restart docker. Verify with: docker run --rm --runtime=${runtime} hello-world. To temporarily use the unsecured default, set DEPLOW_APP_RUNTIME=runc.`,
    )
  }
  return new Error(
    `Docker runtime "${runtime}" is not available on this host. Install it or set DEPLOW_APP_RUNTIME to a registered runtime (e.g. runc).`,
  )
}

export function parseRuntimeLimits(env: {
  appRuntime?: string
  appRuntimeRequired?: boolean
  appMemoryMb?: number
  appCpus?: number
  appReadOnlyRootfs?: boolean
}): AppRuntimeLimits & { required: boolean } {
  const runtime = env.appRuntime?.trim() || "runsc"
  const memoryMb =
    env.appMemoryMb && env.appMemoryMb > 0 ? env.appMemoryMb : 512
  const cpus = env.appCpus && env.appCpus > 0 ? env.appCpus : 1
  return {
    runtime,
    required: env.appRuntimeRequired !== false,
    memoryBytes: memoryMb * 1024 * 1024,
    nanoCpus: Math.round(cpus * 1e9),
    readOnlyRootfs: env.appReadOnlyRootfs !== false,
  }
}
