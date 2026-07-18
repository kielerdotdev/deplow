import { and, eq, inArray, lt, db, operations, services } from "@hostrig/db"

import { transitionServiceBestEffort } from "./transition"

const STALE_OPEN_MS = 2 * 60 * 60 * 1000

/**
 * Heal services stuck in deploying/provisioning when their last op is stale/failed.
 * Called after reclaimStaleOperations marks ops failed.
 */
export async function reconcileStuckServices(): Promise<number> {
  const stuck = await db
    .select({
      id: services.id,
      status: services.status,
      lastOperationId: services.lastOperationId,
    })
    .from(services)
    .where(inArray(services.status, ["deploying", "provisioning"]))

  const cutoff = new Date(Date.now() - STALE_OPEN_MS)
  let healed = 0
  for (const svc of stuck) {
    if (!svc.lastOperationId) {
      const ok = await transitionServiceBestEffort(svc.id, "error", {
        errorMessage: "Operation lost; service left mid-transition",
        errorCode: "stale_operation",
      })
      if (ok) healed++
      continue
    }
    const [op] = await db
      .select()
      .from(operations)
      .where(eq(operations.id, svc.lastOperationId))
      .limit(1)
    if (!op) {
      const ok = await transitionServiceBestEffort(svc.id, "error", {
        errorMessage: "Operation missing; service left mid-transition",
        errorCode: "stale_operation",
      })
      if (ok) healed++
      continue
    }
    if (op.status === "failed" || op.status === "cancelled") {
      const ok = await transitionServiceBestEffort(svc.id, "error", {
        errorMessage: op.errorMessage ?? "Operation failed",
        errorCode: op.errorCode ?? "stale_operation",
        lastOperationId: op.id,
      })
      if (ok) healed++
      continue
    }
    // Open op that reclaim missed (e.g. created before queue mark) past cutoff.
    if (
      (op.status === "created" ||
        op.status === "queued" ||
        op.status === "running") &&
      op.updatedAt < cutoff
    ) {
      const ok = await transitionServiceBestEffort(svc.id, "error", {
        errorMessage: "Operation timed out or worker restarted",
        errorCode: "stale_operation",
        lastOperationId: op.id,
      })
      if (ok) healed++
    }
  }
  return healed
}

/** Services whose ops have been stale longer than cutoff (pre-reclaim). */
export async function findServicesWithStaleOps(
  cutoff: Date,
): Promise<string[]> {
  const rows = await db
    .select({ serviceId: operations.serviceId })
    .from(operations)
    .where(
      and(
        inArray(operations.status, ["created", "running", "queued"]),
        lt(operations.updatedAt, cutoff),
      ),
    )
  return rows
    .map((r) => r.serviceId)
    .filter((id): id is string => Boolean(id))
}
