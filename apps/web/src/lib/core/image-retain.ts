/**
 * Retain the N most recent successful deploy images per service; prune the rest.
 */

import { and, desc, eq, ne, db, deployments } from "@deplow/db"

import type { DockerNodeExecutor } from "./docker-node-executor"

export function imageRetainCount(): number {
  const raw = process.env.DEPLOW_IMAGE_RETAIN
  if (!raw) return 5
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 50) : 5
}

/**
 * After a successful deploy: mark prior running rows as stopped, then prune
 * Docker images beyond the retain window.
 */
export async function retainAndPruneDeployImages(input: {
  serviceId: string
  currentDeploymentId: string
  currentImage: string | null | undefined
  docker: DockerNodeExecutor
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

  const keep = imageRetainCount()
  const rows = await db
    .select({
      id: deployments.id,
      image: deployments.image,
      status: deployments.status,
      createdAt: deployments.createdAt,
    })
    .from(deployments)
    .where(eq(deployments.serviceId, input.serviceId))
    .orderBy(desc(deployments.createdAt))

  const retainImages = new Set<string>()
  if (input.currentImage) retainImages.add(input.currentImage)

  for (const row of rows) {
    if (!row.image) continue
    if (row.status !== "running" && row.status !== "stopped") continue
    if (retainImages.size >= keep) break
    retainImages.add(row.image)
  }

  const candidates = new Set<string>()
  for (const row of rows) {
    if (!row.image) continue
    if (!row.image.startsWith("deplow/")) continue
    if (retainImages.has(row.image)) continue
    candidates.add(row.image)
  }

  for (const image of candidates) {
    await input.docker.removeImage(image).catch(() => undefined)
  }
}

/** Pick prior successful image for rollback (current secrets re-injected on redeploy). */
export function selectRollbackTarget(
  rows: Array<{
    id: string
    image: string | null
    status: string
    nodeId: string
  }>,
  opts: {
    deploymentId?: string
    currentImage?: string | null
  },
): { id: string; image: string; nodeId: string } | null {
  const withImage = rows.filter(
    (r): r is typeof r & { image: string } =>
      Boolean(r.image) &&
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
  // Fallback: second entry with an image (previous known-good)
  if (withImage.length >= 2) {
    const second = withImage[1]!
    return { id: second.id, image: second.image, nodeId: second.nodeId }
  }
  return null
}
