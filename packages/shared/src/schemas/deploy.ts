import { z } from "zod"

import { deployOptionsSchema } from "./node"

export const createDeploymentInputSchema = z
  .object({
    projectId: z.string().min(1),
    /** Optional — defaults to the project's pinned node / local Docker */
    nodeId: z.string().min(1).optional(),
    serviceName: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
      .default("app"),
    /** Prebuilt image (optional if sourcePath set) — advanced path */
    image: z.string().min(1).optional(),
    /** Absolute path to app source for Dockerfile/Railpack build */
    sourcePath: z.string().min(1).optional(),
    /** git_webhook | manual | retry | rollback */
    triggeredBy: z
      .enum(["manual", "git_webhook", "retry", "rollback"])
      .optional()
      .default("manual"),
    options: deployOptionsSchema.optional(),
  })
  .superRefine((val, ctx) => {
    const image = val.image ?? val.options?.image
    if (!image && !val.sourcePath) {
      ctx.addIssue({
        code: "custom",
        message: "Provide image or sourcePath",
        path: ["image"],
      })
    }
    if (val.options?.dockerCompose) {
      ctx.addIssue({
        code: "custom",
        message:
          "Docker Compose deploy is not supported; use image or sourcePath",
        path: ["options", "dockerCompose"],
      })
    }
  })

export type CreateDeploymentInput = z.infer<typeof createDeploymentInputSchema>

export const deploymentStatusSchema = z.enum([
  "pending",
  "queued",
  "building",
  "deploying",
  "running",
  "failed",
  "stopped",
])

export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>

export const deploymentSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  nodeId: z.string(),
  serviceName: z.string(),
  image: z.string().nullable().optional(),
  buildStrategy: z.string().nullable().optional(),
  buildLogs: z.string().nullable().optional(),
  sourcePath: z.string().nullable().optional(),
  status: deploymentStatusSchema,
  containerId: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  triggeredBy: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
})

export type DeploymentSummary = z.infer<typeof deploymentSummarySchema>

export const retryDeploymentInputSchema = z.object({
  id: z.string().min(1),
})

export type RetryDeploymentInput = z.infer<typeof retryDeploymentInputSchema>

export const rollbackDeploymentInputSchema = z.object({
  /** Deployment to roll back *from* — uses previous running image */
  projectId: z.string().min(1),
  /** Optional explicit prior deployment id */
  deploymentId: z.string().min(1).optional(),
})

export type RollbackDeploymentInput = z.infer<
  typeof rollbackDeploymentInputSchema
>
