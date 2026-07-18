/**
 * Single writer for services.status. All lifetime mutations go through here.
 */

import { eq, db, services } from "@hostrig/db"

export type ServiceStatus =
  | "queued"
  | "provisioning"
  | "deploying"
  | "running"
  | "stopped"
  | "error"
  | "destroying"
  | "ready"

const ALLOWED: Record<string, ReadonlySet<string>> = {
  queued: new Set(["provisioning", "deploying", "stopped", "error", "destroying"]),
  stopped: new Set(["deploying", "provisioning", "destroying", "error"]),
  provisioning: new Set(["running", "error", "stopped"]),
  deploying: new Set(["running", "error", "stopped"]),
  running: new Set(["deploying", "stopped", "destroying", "error"]),
  error: new Set(["deploying", "provisioning", "destroying", "stopped"]),
  destroying: new Set(["error"]), // failure before row delete
  ready: new Set([
    "running",
    "stopped",
    "deploying",
    "provisioning",
    "error",
    "destroying",
  ]),
}

export class IllegalServiceTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Illegal service status transition: ${from} → ${to}`)
    this.name = "IllegalServiceTransitionError"
  }
}

export function canTransitionServiceStatus(
  from: string,
  to: string,
): boolean {
  if (from === to) return true
  const edges = ALLOWED[from]
  return Boolean(edges?.has(to))
}

export type TransitionPatch = {
  errorMessage?: string | null
  errorCode?: string | null
  lastOperationId?: string | null
  publicUrl?: string | null
  image?: string | null
  containerId?: string | null
  credentialsEncrypted?: string | null
}

/**
 * Atomically move a service to a new status. Throws on illegal edges.
 * Same-status updates still apply patch fields (e.g. clear errors).
 */
export async function transitionService(
  serviceId: string,
  to: ServiceStatus,
  patch: TransitionPatch = {},
): Promise<void> {
  const [row] = await db
    .select({ status: services.status })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1)
  if (!row) {
    throw new Error(`Service not found: ${serviceId}`)
  }
  const from = row.status
  if (!canTransitionServiceStatus(from, to)) {
    throw new IllegalServiceTransitionError(from, to)
  }

  await db
    .update(services)
    .set({
      status: to === "ready" ? "stopped" : to,
      ...(patch.errorMessage !== undefined
        ? { errorMessage: patch.errorMessage }
        : {}),
      ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
      ...(patch.lastOperationId !== undefined
        ? { lastOperationId: patch.lastOperationId }
        : {}),
      ...(patch.publicUrl !== undefined ? { publicUrl: patch.publicUrl } : {}),
      ...(patch.image !== undefined ? { image: patch.image } : {}),
      ...(patch.containerId !== undefined
        ? { containerId: patch.containerId }
        : {}),
      ...(patch.credentialsEncrypted !== undefined
        ? { credentialsEncrypted: patch.credentialsEncrypted }
        : {}),
    })
    .where(eq(services.id, serviceId))
}

/** Best-effort transition — logs and skips illegal edges (for reclaim paths). */
export async function transitionServiceBestEffort(
  serviceId: string,
  to: ServiceStatus,
  patch: TransitionPatch = {},
): Promise<boolean> {
  try {
    await transitionService(serviceId, to, patch)
    return true
  } catch (e) {
    if (e instanceof IllegalServiceTransitionError) {
      console.warn(`[lifecycle] ${e.message} (service ${serviceId})`)
      return false
    }
    throw e
  }
}
