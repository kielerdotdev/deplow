import { z } from "zod"

export const operationTypeSchema = z.enum([
  "deploy",
  "provision",
  "backup",
  "restore",
  "pitr_restore",
  "destroy",
])

export const operationStatusSchema = z.enum([
  "created",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
])

export const operationSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  serviceId: z.string().nullable(),
  type: operationTypeSchema,
  status: operationStatusSchema,
  stage: z.string().nullable(),
  triggeredBy: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  rootCause: z.string().nullable().optional(),
  symptom: z.string().nullable().optional(),
  logsText: z.string().nullable().optional(),
  attempts: z.number().int(),
  createdAt: z.string(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  updatedAt: z.string(),
})

export type OperationSummary = z.infer<typeof operationSummarySchema>
