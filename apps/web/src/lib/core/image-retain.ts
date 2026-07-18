/**
 * Deployment history helpers for rollback + keeping one "current" running row.
 */

import { and, eq, ne, db, deployments } from "@hostrig/db"

export function imageRetainCount(): number {
  const raw = process.env.HOSTRIG_IMAGE_RETAIN
  if (!raw) return 5
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 50) : 5
}

/** After a successful deploy: mark prior running rows as stopped. */
export async function markPriorDeploymentsStopped(input: {
  serviceId: string
  currentDeploymentId: string
}): Promise<void> {
  await db
    .update(deployments)
    .set({ status: "stopped" })
    .where(
      and(
        eq(deployments.serviceId, input.serviceId),
        eq(deployments.status, "running"),
        ne(deployments.id, input.currentDeploymentId),
      ),
    )
}

/** Pick prior successful image for rollback (current secrets re-injected on redeploy). */
export function selectRollbackTarget(
  rows: Array<{
    id: string
    image: string | null
    status: string
    nodeId: string | null
  }>,
  opts: {
    deploymentId?: string
    currentImage?: string | null
  },
): { id: string; image: string; nodeId: string } | null {
  const withImage = rows.filter(
    (r): r is typeof r & { image: string; nodeId: string } =>
      Boolean(r.image) &&
      Boolean(r.nodeId) &&
      (r.status === "running" || r.status === "stopped"),
  )
  if (opts.deploymentId) {
    const hit = withImage.find((r) => r.id === opts.deploymentId)
    if (!hit) return null
    return { id: hit.id, image: hit.image, nodeId: hit.nodeId }
  }
  const prior = withImage.find(
    (r) => r.image !== opts.currentImage && r.status !== "running",
  )
  if (prior) {
    return { id: prior.id, image: prior.image, nodeId: prior.nodeId }
  }
  if (withImage.length >= 2) {
    const second = withImage[1]!
    return { id: second.id, image: second.image, nodeId: second.nodeId }
  }
  return null
}
