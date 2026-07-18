/**
 * Host preflight / doctor checks (pure evaluation + injectable probes).
 * CLI and UI call the same evaluator.
 */

export type DoctorStatus = "ok" | "warn" | "fail" | "skip"

export interface DoctorCheckResult {
  id: string
  label: string
  status: DoctorStatus
  detail: string
}

export interface DoctorProbeResults {
  dockerOk: boolean
  dockerDetail?: string
  runscOk: boolean
  runscDetail?: string
  buildkitOk: boolean
  buildkitDetail?: string
  railpackOk: boolean
  railpackDetail?: string
  postgresOk: boolean
  redisOk: boolean
  minioOk: boolean
  caddyOk: boolean
  baseDomain: string
  secretsConfigured: boolean
  nodeEnv?: string
  observeEnabled?: boolean
  clickhouseOk?: boolean
  clickhouseDetail?: string
}

/**
 * Map raw probe results into operator-facing doctor rows.
 * Pure function — unit-tested without shelling out.
 */
export function evaluateDoctorChecks(
  probes: DoctorProbeResults,
): DoctorCheckResult[] {
  const rows: DoctorCheckResult[] = []

  rows.push({
    id: "docker",
    label: "Docker Engine",
    status: probes.dockerOk ? "ok" : "fail",
    detail: probes.dockerOk
      ? (probes.dockerDetail ?? "Docker daemon reachable")
      : (probes.dockerDetail ??
        "Docker not reachable. Start Docker and ensure the control plane can use the socket."),
  })

  rows.push({
    id: "runsc",
    label: "gVisor (runsc)",
    status: probes.runscOk ? "ok" : "fail",
    detail: probes.runscOk
      ? (probes.runscDetail ?? "runsc runtime registered")
      : (probes.runscDetail ??
        "runsc missing. Install gVisor on every k3s node (scripts/install-gvisor-k3s.sh). User apps require gVisor."),
  })

  rows.push({
    id: "buildkit",
    label: "BuildKit",
    status: probes.buildkitOk ? "ok" : "warn",
    detail: probes.buildkitOk
      ? (probes.buildkitDetail ?? "BuildKit available")
      : (probes.buildkitDetail ??
        "BuildKit not detected. Railpack/Dockerfile builds may fail. Start moby/buildkit."),
  })

  rows.push({
    id: "railpack",
    label: "Railpack CLI",
    status: probes.railpackOk ? "ok" : "warn",
    detail: probes.railpackOk
      ? (probes.railpackDetail ?? "railpack on PATH")
      : (probes.railpackDetail ??
        "railpack not on PATH. Dockerfile deploys still work; source without Dockerfile needs Railpack."),
  })

  const composeAll =
    probes.postgresOk && probes.redisOk && probes.minioOk && probes.caddyOk
  rows.push({
    id: "compose",
    label: "Platform compose (PG/Redis/MinIO/Caddy)",
    status: composeAll ? "ok" : "fail",
    detail: composeAll
      ? "Postgres, Redis, MinIO, and Caddy look healthy"
      : `Reachability — postgres:${probes.postgresOk} redis:${probes.redisOk} minio:${probes.minioOk} caddy:${probes.caddyOk}. Run pnpm infra:up.`,
  })

  const domain = (probes.baseDomain ?? "").trim()
  rows.push({
    id: "base-domain",
    label: "Base domain",
    status: domain ? "ok" : "warn",
    detail: domain
      ? `HOSTRIG_BASE_DOMAIN=${domain}`
      : "HOSTRIG_BASE_DOMAIN empty — public URL features off until set (or use apps.localhost in dev).",
  })

  const prod = probes.nodeEnv === "production"
  rows.push({
    id: "secrets",
    label: "Auth / secrets keys",
    status: probes.secretsConfigured ? "ok" : prod ? "fail" : "warn",
    detail: probes.secretsConfigured
      ? "BETTER_AUTH_SECRET / HOSTRIG_SECRETS_KEY configured"
      : "Set BETTER_AUTH_SECRET and HOSTRIG_SECRETS_KEY before production use.",
  })

  if (probes.observeEnabled) {
    rows.push({
      id: "observe-clickhouse",
      label: "Observe ClickHouse",
      status: probes.clickhouseOk ? "ok" : "fail",
      detail: probes.clickhouseOk
        ? (probes.clickhouseDetail ?? "ClickHouse reachable")
        : (probes.clickhouseDetail ??
          "Observe enabled but ClickHouse unreachable. Start compose profile observe."),
    })
  } else {
    rows.push({
      id: "observe-clickhouse",
      label: "Observe ClickHouse",
      status: "skip",
      detail: "HOSTRIG_OBSERVE_ENABLED is off",
    })
  }

  return rows
}

export function doctorSummary(checks: DoctorCheckResult[]): {
  ok: boolean
  failCount: number
  warnCount: number
} {
  const failCount = checks.filter((c) => c.status === "fail").length
  const warnCount = checks.filter((c) => c.status === "warn").length
  return { ok: failCount === 0, failCount, warnCount }
}

/** Max webhook body size (bytes) — shared constant for route + tests */
export const MAX_WEBHOOK_BODY_BYTES = 1_048_576 // 1 MiB

export function isWebhookBodyTooLarge(byteLength: number): boolean {
  return byteLength > MAX_WEBHOOK_BODY_BYTES
}
