import { and, db, eq, lt, nodeJobs, or } from "@deplow/db"
import type { AgentJobType } from "@deplow/shared"

import { JOB_LEASE_MS } from "./tokens"

export async function enqueueNodeJob(input: {
  nodeId: string
  operationId?: string | null
  type: AgentJobType
  payload: unknown
}): Promise<string> {
  const id = crypto.randomUUID()
  await db.insert(nodeJobs).values({
    id,
    nodeId: input.nodeId,
    operationId: input.operationId ?? null,
    type: input.type,
    payloadJson: JSON.stringify(input.payload),
    status: "pending",
  })
  return id
}

export async function claimNextJob(nodeId: string): Promise<{
  id: string
  type: AgentJobType
  payload: unknown
  leaseExpiresAt: Date
} | null> {
  const now = new Date()
  await db
    .update(nodeJobs)
    .set({ status: "pending", claimedAt: null, leaseExpiresAt: null })
    .where(
      and(
        eq(nodeJobs.nodeId, nodeId),
        or(eq(nodeJobs.status, "claimed"), eq(nodeJobs.status, "running")),
        lt(nodeJobs.leaseExpiresAt, now),
      ),
    )

  const [pending] = await db
    .select()
    .from(nodeJobs)
    .where(and(eq(nodeJobs.nodeId, nodeId), eq(nodeJobs.status, "pending")))
    .limit(1)

  if (!pending) return null

  const leaseExpiresAt = new Date(Date.now() + JOB_LEASE_MS)
  const updated = await db
    .update(nodeJobs)
    .set({
      status: "claimed",
      claimedAt: now,
      leaseExpiresAt,
    })
    .where(and(eq(nodeJobs.id, pending.id), eq(nodeJobs.status, "pending")))
    .returning()

  if (updated.length === 0) return null

  let payload: unknown
  try {
    payload = JSON.parse(pending.payloadJson)
  } catch {
    payload = {}
  }

  return {
    id: pending.id,
    type: pending.type as AgentJobType,
    payload,
    leaseExpiresAt,
  }
}

export async function markJobRunning(jobId: string, nodeId: string) {
  await db
    .update(nodeJobs)
    .set({ status: "running" })
    .where(and(eq(nodeJobs.id, jobId), eq(nodeJobs.nodeId, nodeId)))
}

export async function completeJob(input: {
  jobId: string
  nodeId: string
  ok: boolean
  result?: unknown
  error?: unknown
}) {
  await db
    .update(nodeJobs)
    .set({
      status: input.ok ? "succeeded" : "failed",
      resultJson: input.result ? JSON.stringify(input.result) : null,
      errorJson: input.error ? JSON.stringify(input.error) : null,
      leaseExpiresAt: null,
    })
    .where(and(eq(nodeJobs.id, input.jobId), eq(nodeJobs.nodeId, input.nodeId)))
}

export async function getJobForNode(jobId: string, nodeId: string) {
  const [row] = await db
    .select()
    .from(nodeJobs)
    .where(and(eq(nodeJobs.id, jobId), eq(nodeJobs.nodeId, nodeId)))
    .limit(1)
  return row ?? null
}
