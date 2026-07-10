import { z } from "zod"

import { deployOptionsSchema } from "./node"

export const createDeploymentInputSchema = z
  .object({
    projectId: z.string().min(1),
    nodeId: z.string().min(1),
    serviceName: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
    /** Prebuilt image (optional if sourcePath set) */
    image: z.string().min(1).optional(),
    /** Absolute path to app source for Dockerfile/Railpack build */
    sourcePath: z.string().min(1).optional(),
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

export const deploymentSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  nodeId: z.string(),
  serviceName: z.string(),
  image: z.string().nullable().optional(),
  buildStrategy: z.string().nullable().optional(),
  buildLogs: z.string().nullable().optional(),
  sourcePath: z.string().nullable().optional(),
  status: z.enum(["pending", "building", "running", "failed", "stopped"]),
  containerId: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
})

export type DeploymentSummary = z.infer<typeof deploymentSummarySchema>
