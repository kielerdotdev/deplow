/** Subset of platform config needed for docker/build/git on a node. */
export interface RuntimeConfig {
  dockerSocketPath: string
  dockerNetwork: string
  appRuntime: string
  appRuntimeRequired: boolean
  appMemoryBytes: number
  appNanoCpus: number
  appReadOnlyRootfs: boolean
  gitCloneRoot: string
  railpackBin?: string
  buildkitHost?: string
  dockerBin?: string
  s3?: {
    appEndpoint: string
    region: string
  }
}

export function loadRuntimeConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  return {
    dockerSocketPath: env.DEPLOW_DOCKER_SOCKET ?? "/var/run/docker.sock",
    dockerNetwork: env.DEPLOW_DOCKER_NETWORK ?? "deplow_default",
    appRuntime: env.DEPLOW_APP_RUNTIME ?? "runsc",
    appRuntimeRequired: env.DEPLOW_APP_RUNTIME_REQUIRED !== "false",
    appMemoryBytes: Number(env.DEPLOW_APP_MEMORY_BYTES ?? 512 * 1024 * 1024),
    appNanoCpus: Number(env.DEPLOW_APP_NANO_CPUS ?? 1_000_000_000),
    appReadOnlyRootfs: env.DEPLOW_APP_READ_ONLY_ROOTFS !== "false",
    gitCloneRoot: env.DEPLOW_GIT_CLONE_ROOT ?? "/var/lib/deplow-agent/git",
    railpackBin: env.RAILPACK_BIN ?? "railpack",
    buildkitHost: env.BUILDKIT_HOST,
    dockerBin: env.DOCKER_BIN ?? "docker",
  }
}
