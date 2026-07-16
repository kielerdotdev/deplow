import type { DeploymentStatus } from "@deplow/shared"

export const DEPLOYMENT_STAGES = [
  "queued",
  "analyzing",
  "building",
  "deploying",
  "checking",
  "running",
] as const

export type DeploymentStage = (typeof DEPLOYMENT_STAGES)[number]

const BUILD_PHASE: ReadonlySet<string> = new Set([
  "pending",
  "queued",
  "analyzing",
  "building",
])

const IN_PROGRESS: ReadonlySet<string> = new Set([
  "pending",
  "queued",
  "analyzing",
  "building",
  "deploying",
  "checking",
])

/** Deployment status labels for badges and copy. */
export const deploymentStatusLabel: Record<string, string> = {
  pending: "Queued",
  queued: "Queued",
  analyzing: "Analyzing",
  building: "Building",
  deploying: "Releasing",
  checking: "Verifying",
  running: "Succeeded",
  failed: "Failed",
  stopped: "Stopped",
}

export const serviceStatusLabel: Record<string, string> = {
  queued: "Queued",
  provisioning: "Provisioning",
  deploying: "Deploying",
  running: "Healthy",
  ready: "Healthy",
  stopped: "Stopped",
  error: "Unavailable",
  destroying: "Destroying",
}

/** Display status for service cards — prefer "Not deployed" when never live. */
export function resolveServiceDisplayStatus(input: {
  serviceStatus: string
  hasSuccessfulDeploy: boolean
}): string {
  const { serviceStatus, hasSuccessfulDeploy } = input
  if (serviceStatus === "running" || serviceStatus === "ready") {
    return serviceStatus
  }
  if (serviceStatus === "deploying" || serviceStatus === "provisioning") {
    return serviceStatus
  }
  if (serviceStatus === "error" || serviceStatus === "destroying") {
    return serviceStatus
  }
  if (!hasSuccessfulDeploy) return "not_deployed"
  return serviceStatus
}

export function isDeploymentInProgress(status: string): boolean {
  return IN_PROGRESS.has(status)
}

export function isBuildPhase(status: string): boolean {
  return BUILD_PHASE.has(status)
}

export function normalizeDeploymentStage(status: string): DeploymentStage | "failed" | "stopped" {
  if (status === "pending") return "queued"
  if (status === "failed" || status === "stopped") return status
  if ((DEPLOYMENT_STAGES as readonly string[]).includes(status)) {
    return status as DeploymentStage
  }
  return "queued"
}

export function triggerLabel(triggeredBy: string | null | undefined): string {
  switch (triggeredBy) {
    case "git_webhook":
      return "Git push"
    case "retry":
      return "Retry"
    case "rollback":
      return "Rollback"
    case "manual":
      return "Manual"
    default:
      return triggeredBy ? triggeredBy.replace(/_/g, " ") : "Deploy"
  }
}

export function shortSha(sha: string | null | undefined): string | null {
  if (!sha) return null
  return sha.slice(0, 7)
}

export function defaultDeploymentView(
  status: DeploymentStatus | string,
): "summary" | "build-logs" | "runtime-logs" | "events" {
  if (isDeploymentInProgress(status) || isBuildPhase(status)) return "build-logs"
  return "summary"
}

export type DeployPrimaryAction =
  | { kind: "deploy"; label: string }
  | { kind: "view"; label: string; deploymentId: string }
  | { kind: "retry"; label: string; deploymentId: string }

export function resolveDeployPrimaryAction(input: {
  gitConnected: boolean
  latest: { id: string; status: string } | null | undefined
}): DeployPrimaryAction {
  const latest = input.latest
  if (latest && isDeploymentInProgress(latest.status)) {
    const label =
      latest.status === "building" || latest.status === "analyzing"
        ? "View build"
        : "View deployment"
    return { kind: "view", label, deploymentId: latest.id }
  }
  if (latest?.status === "failed") {
    return { kind: "retry", label: "Retry deployment", deploymentId: latest.id }
  }
  if (!latest) {
    return { kind: "deploy", label: "Deploy" }
  }
  return { kind: "deploy", label: "Deploy latest" }
}
