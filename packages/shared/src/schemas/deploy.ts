import { z } from "zod"

import { deployOptionsSchema } from "./node"

export const createDeploymentInputSchema = z
  .object({
    serviceId: z.string().min(1),
    /** Optional — defaults to the parent project's pinned node */
    nodeId: z.string().min(1).optional(),
    /** Prebuilt image (optional if sourcePath set) — advanced path */
    image: z.string().min(1).optional(),
    /** Absolute path to app source for Dockerfile/Railpack build */
    sourcePath: z.string().min(1).optional(),
    /** Clone the service's connected Git repo and deploy (happy path) */
    fromGit: z.boolean().optional(),
    /** git_webhook | manual | retry | rollback */
    triggeredBy: z
      .enum(["manual", "git_webhook", "retry", "rollback"])
      .optional()
      .default("manual"),
    options: deployOptionsSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.fromGit) return
    const image = val.image ?? val.options?.image
    if (!image && !val.sourcePath) {
      ctx.addIssue({
        code: "custom",
        message: "Provide image, sourcePath, or fromGit",
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
  serviceId: z.string(),
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
  serviceId: z.string().min(1),
  /** Optional explicit prior deployment id */
  deploymentId: z.string().min(1).optional(),
})

export type RollbackDeploymentInput = z.infer<
  typeof rollbackDeploymentInputSchema
>
