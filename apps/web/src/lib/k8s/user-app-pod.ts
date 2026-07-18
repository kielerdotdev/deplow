/**
 * Hardened pod/container settings for user app workloads on k3s.
 * User apps always use gVisor RuntimeClass — runc is not an option.
 */

export const USER_APP_RUNTIME_CLASS = "gvisor" as const

export type UserAppPodHardeningInput = {
  /**
   * @deprecated Ignored — user apps always use gVisor.
   * Kept for call-site compatibility.
   */
  appRuntime?: string
  memoryBytes: number
  /** CPU in Docker NanoCpus units (1 CPU = 1e9) */
  nanoCpus: number
  readOnlyRootfs?: boolean
  /**
   * Non-root UID for restricted PSS. Default 65532 (distroless/nonroot).
   */
  runAsUser?: number
}

export type UserAppPodHardening = {
  /** Always gvisor for user apps */
  runtimeClassName: typeof USER_APP_RUNTIME_CLASS
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

/**
 * Map HOSTRIG_APP_RUNTIME to a Kubernetes RuntimeClass name.
 * User apps always use gVisor; runc / default / empty are rejected (return gvisor).
 */
export function resolveRuntimeClassName(appRuntime?: string): string {
  const r = (appRuntime ?? "").trim().toLowerCase()
  if (r === "runc" || r === "default") {
    console.warn(
      "[hostrig] HOSTRIG_APP_RUNTIME=runc is disabled — user apps always use gVisor RuntimeClass",
    )
  }
  // Always gvisor for user app workloads (runsc, gvisor, empty, or unknown).
  if (!r || r === "runc" || r === "default" || r === "runsc" || r.startsWith("runsc") || r === "gvisor") {
    return USER_APP_RUNTIME_CLASS
  }
  // Reject alternate sandboxes for now — only gVisor is supported.
  console.warn(
    `[hostrig] Unsupported HOSTRIG_APP_RUNTIME="${appRuntime}" — forcing gVisor`,
  )
  return USER_APP_RUNTIME_CLASS
}

export function isGvisorRuntime(_appRuntime?: string): boolean {
  return true
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

  return {
    runtimeClassName: USER_APP_RUNTIME_CLASS,
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
