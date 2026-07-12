import { and, eq, inArray, lt, operations, db } from "@deplow/db"

import { notifyOperatorWebhook } from "@/lib/core/operator-webhook"

const STALE_RUNNING_MS = 2 * 60 * 60 * 1000

export type OperationType =
  | "deploy"
  | "provision"
  | "backup"
  | "restore"
  | "pitr_restore"
  | "destroy"

export type OperationStatus =
  | "created"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"

export function toOperationSummary(row: typeof operations.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    serviceId: row.serviceId,
    type: row.type,
    status: row.status,
    stage: row.stage,
    triggeredBy: row.triggeredBy,
    errorMessage: row.errorMessage,
    errorCode: row.errorCode,
    rootCause: row.rootCause,
    symptom: row.symptom,
    logsText: row.logsText,
    attempts: row.attempts,
    input: row.inputJson ? safeJson(row.inputJson) : null,
    result: row.resultJson ? safeJson(row.resultJson) : null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export async function createOperation(input: {
  projectId: string
  serviceId?: string | null
  type: OperationType
  triggeredBy?: string
  input?: unknown
  idempotencyKey?: string | null
  stage?: string | null
}): Promise<typeof operations.$inferSelect> {
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(operations)
      .where(eq(operations.idempotencyKey, input.idempotencyKey))
    if (existing) return existing
  }

  const id = crypto.randomUUID()
  await db.insert(operations).values({
    id,
    projectId: input.projectId,
    serviceId: input.serviceId ?? null,
    type: input.type,
    status: "created",
    stage: input.stage ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    triggeredBy: input.triggeredBy ?? "manual",
    inputJson: input.input ? JSON.stringify(input.input) : null,
  })
  const [row] = await db.select().from(operations).where(eq(operations.id, id))
  return row!
}

export async function markOperationQueued(id: string): Promise<void> {
  await db
    .update(operations)
    .set({ status: "queued" })
    .where(eq(operations.id, id))
}

export async function markOperationRunning(
  id: string,
  stage?: string,
): Promise<void> {
  const attempts = (await getAttempts(id)) + 1
  await db
    .update(operations)
    .set({
      status: "running",
      stage: stage ?? null,
      startedAt: new Date(),
      attempts,
    })
    .where(eq(operations.id, id))
}

async function getAttempts(id: string): Promise<number> {
  const [row] = await db
    .select({ attempts: operations.attempts })
    .from(operations)
    .where(eq(operations.id, id))
  return row?.attempts ?? 0
}

export async function updateOperationStage(
  id: string,
  stage: string,
  logsAppend?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { stage }
  if (logsAppend) {
    const [row] = await db
      .select({ logsText: operations.logsText })
      .from(operations)
      .where(eq(operations.id, id))
    patch.logsText = [row?.logsText, logsAppend].filter(Boolean).join("\n")
  }
  await db.update(operations).set(patch).where(eq(operations.id, id))
}

export async function markOperationSucceeded(
  id: string,
  result?: unknown,
): Promise<void> {
  await db
    .update(operations)
    .set({
      status: "succeeded",
      finishedAt: new Date(),
      errorMessage: null,
      errorCode: null,
      rootCause: null,
      symptom: null,
      resultJson: result ? JSON.stringify(result) : null,
    })
    .where(eq(operations.id, id))
  void notifyOperatorWebhook(id)
}

export async function markOperationFailed(
  id: string,
  error: {
    message: string
    code?: string
    rootCause?: string
    symptom?: string
    stage?: string
    logs?: string
  },
): Promise<void> {
  await db
    .update(operations)
    .set({
      status: "failed",
      finishedAt: new Date(),
      errorMessage: error.message,
      errorCode: error.code ?? null,
      rootCause: error.rootCause ?? null,
      symptom: error.symptom ?? null,
      stage: error.stage ?? undefined,
      logsText: error.logs ?? undefined,
    })
    .where(eq(operations.id, id))
  void notifyOperatorWebhook(id)
}

/** Mark stale running ops as failed after process crash. */
export async function reclaimStaleOperations(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS)
  const stale = await db
    .select({ id: operations.id })
    .from(operations)
    .where(
      and(
        inArray(operations.status, ["running", "queued"]),
        lt(operations.updatedAt, cutoff),
      ),
    )
  for (const row of stale) {
    await markOperationFailed(row.id, {
      message: "Operation timed out or worker restarted",
      code: "stale_operation",
    })
  }
  return stale.length
}
