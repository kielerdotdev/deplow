/**
 * Hardened pod/container settings for user app workloads on k3s.
 * Mirrors packages/runtime host-config defaults (gVisor + caps + RO rootfs + limits).
 */

export type UserAppPodHardeningInput = {
  /** OCI / DEPLOW_APP_RUNTIME value: runsc → RuntimeClass gvisor; runc → none */
  appRuntime: string
  memoryBytes: number
  /** CPU in Docker NanoCpus units (1 CPU = 1e9) */
  nanoCpus: number
  readOnlyRootfs?: boolean
  /**
   * Non-root UID for restricted PSS. Default 65532 (distroless/nonroot).
   * Images that must run as root need DEPLOW_APP_RUNTIME=runc + softer policy later.
   */
  runAsUser?: number
}

export type UserAppPodHardening = {
  /** Set on pod spec when gVisor is selected */
  runtimeClassName?: string
  podSecurityContext: {
    runAsNonRoot: true
    runAsUser: number
    runAsGroup: number
    fsGroup: number
    seccompProfile: { type: "RuntimeDefault" }
  }
  containerSecurityContext: {
    allowPrivilegeEscalation: false
    privileged: false
    readOnlyRootFilesystem: boolean
    runAsNonRoot: true
    runAsUser: number
    runAsGroup: number
    capabilities: { drop: ["ALL"] }
    seccompProfile: { type: "RuntimeDefault" }
  }
  resources: {
    requests: { memory: string; cpu: string }
    limits: { memory: string; cpu: string }
  }
  /** emptyDir volume + mount for /tmp (and writable scratch) */
  volumes: Array<{ name: string; emptyDir: Record<string, never> }>
  volumeMounts: Array<{ name: string; mountPath: string }>
}

/** Map DEPLOW_APP_RUNTIME to a Kubernetes RuntimeClass name. */
export function resolveRuntimeClassName(appRuntime: string): string | undefined {
  const r = appRuntime.trim().toLowerCase()
  if (!r || r === "runc" || r === "default") return undefined
  if (r === "runsc" || r.startsWith("runsc") || r === "gvisor") return "gvisor"
  // Future: kata → "kata". Unknown values pass through as RuntimeClass names.
  return r
}

export function isGvisorRuntime(appRuntime: string): boolean {
  const name = resolveRuntimeClassName(appRuntime)
  return name === "gvisor"
}

function formatCpu(nanoCpus: number): string {
  const cpus = nanoCpus > 0 ? nanoCpus / 1e9 : 1
  if (Number.isInteger(cpus)) return String(cpus)
  return `${Math.round(cpus * 1000)}m`
}

function formatMemory(memoryBytes: number): string {
  const mi = Math.max(1, Math.round(memoryBytes / (1024 * 1024)))
  return `${mi}Mi`
}

/**
 * Build pod-level hardening for web/worker Deployments.
 * Data-plane Postgres/Redis must NOT use this (stay on default runtime).
 */
export function buildUserAppPodHardening(
  input: UserAppPodHardeningInput,
): UserAppPodHardening {
  const uid = input.runAsUser ?? 65532
  const readOnly = input.readOnlyRootfs !== false
  const memory = formatMemory(input.memoryBytes)
  const cpu = formatCpu(input.nanoCpus)
  const runtimeClassName = resolveRuntimeClassName(input.appRuntime)

  return {
    runtimeClassName,
    podSecurityContext: {
      runAsNonRoot: true,
      runAsUser: uid,
      runAsGroup: uid,
      fsGroup: uid,
      seccompProfile: { type: "RuntimeDefault" },
    },
    containerSecurityContext: {
      allowPrivilegeEscalation: false,
      privileged: false,
      readOnlyRootFilesystem: readOnly,
      runAsNonRoot: true,
      runAsUser: uid,
      runAsGroup: uid,
      capabilities: { drop: ["ALL"] },
      seccompProfile: { type: "RuntimeDefault" },
    },
    resources: {
      requests: { memory, cpu },
      limits: { memory, cpu },
    },
    volumes: [{ name: "tmp", emptyDir: {} }],
    volumeMounts: [{ name: "tmp", mountPath: "/tmp" }],
  }
}
