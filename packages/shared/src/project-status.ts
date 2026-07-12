import type { ProjectStatus } from "./schemas/project"
import type { ServiceStatus } from "./schemas/service"

const IN_PROGRESS: ReadonlySet<ServiceStatus> = new Set([
  "queued",
  "provisioning",
  "deploying",
])

const HEALTHY: ReadonlySet<ServiceStatus> = new Set(["running"])

const FAILED: ReadonlySet<ServiceStatus> = new Set(["error"])

const STOPPED: ReadonlySet<ServiceStatus> = new Set(["stopped", "ready"])

type ServiceHealth = "in_progress" | "healthy" | "failed" | "stopped" | "other"

function classifyServiceStatus(status: string): ServiceHealth {
  if (IN_PROGRESS.has(status as ServiceStatus)) return "in_progress"
  if (HEALTHY.has(status as ServiceStatus)) return "healthy"
  if (FAILED.has(status as ServiceStatus)) return "failed"
  if (STOPPED.has(status as ServiceStatus)) return "stopped"
  return "other"
}

/**
 * Derive a project-level status from stored lifecycle state and service health.
 * Stored `ready` is treated as "no lifecycle blockers"; service rows drive health.
 */
export function deriveProjectStatus(
  storedStatus: ProjectStatus,
  serviceStatuses: string[],
): ProjectStatus {
  if (storedStatus === "destroying") return "destroying"
  if (storedStatus === "provisioning") return "provisioning"

  if (serviceStatuses.length === 0) return "ready"

  const classes = serviceStatuses.map(classifyServiceStatus)

  if (classes.some((c) => c === "in_progress")) return "provisioning"

  const healthyCount = classes.filter((c) => c === "healthy").length
  const failedCount = classes.filter((c) => c === "failed").length
  const stoppedCount = classes.filter((c) => c === "stopped").length

  if (healthyCount > 0 && failedCount === 0) return "ready"
  if (healthyCount > 0 && failedCount > 0) return "degraded"
  if (failedCount > 0 && stoppedCount === 0) return "error"
  if (failedCount > 0) return "degraded"
  if (stoppedCount > 0) return "stopped"

  return "ready"
}
