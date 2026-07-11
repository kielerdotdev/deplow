import { z } from "zod"

import { gitAuthMethodSchema, gitProviderSchema } from "./project"

const serviceNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
    message: "Use lowercase letters, numbers, and hyphens",
  })

export const serviceTypeSchema = z.enum(["web", "worker"])
export type ServiceType = z.infer<typeof serviceTypeSchema>

export const serviceStatusSchema = z.enum([
  "ready",
  "deploying",
  "running",
  "stopped",
  "error",
])
export type ServiceStatus = z.infer<typeof serviceStatusSchema>

export const createServiceInputSchema = z.object({
  projectId: z.string().min(1),
  name: serviceNameSchema,
  type: serviceTypeSchema.default("web"),
  containerPort: z.number().int().min(1).max(65_535).default(80),
})
export type CreateServiceInput = z.infer<typeof createServiceInputSchema>

export const updateServiceInputSchema = z.object({
  id: z.string().min(1),
  containerPort: z.number().int().min(1).max(65_535).optional(),
  isPrimary: z.boolean().optional(),
  env: z.record(z.string(), z.string()).optional(),
})
export type UpdateServiceInput = z.infer<typeof updateServiceInputSchema>

export const serviceGitStatusSchema = z.object({
  connected: z.boolean(),
  provider: gitProviderSchema.nullable().optional(),
  repoUrl: z.string().nullable().optional(),
  repoFullName: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  webhookUrl: z.string().nullable().optional(),
  authMethod: gitAuthMethodSchema.nullable().optional(),
  webhookManaged: z.boolean().optional(),
  lastDeliveryAt: z.string().nullable().optional(),
  lastDeliveryStatus: z.string().nullable().optional(),
  lastDeliveryError: z.string().nullable().optional(),
  connectedAt: z.string().nullable().optional(),
})
export type ServiceGitStatus = z.infer<typeof serviceGitStatusSchema>

export const connectServiceGitInputSchema = z.object({
  serviceId: z.string().min(1),
  provider: gitProviderSchema,
  repoUrl: z.string().url(),
  branch: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9._\-/]+$/)
    .default("main"),
  webhookSecret: z.string().min(8).max(256).optional(),
  repoFullName: z.string().min(1).max(256).optional(),
  authMethod: gitAuthMethodSchema.optional(),
  installationId: z.string().min(1).optional(),
  accessToken: z.string().min(1).optional(),
  autoWebhook: z.boolean().optional().default(true),
})
export type ConnectServiceGitInput = z.infer<
  typeof connectServiceGitInputSchema
>

export const serviceSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  slug: z.string(),
  type: serviceTypeSchema,
  isPrimary: z.boolean(),
  containerPort: z.number().int(),
  status: serviceStatusSchema,
  publicUrl: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  env: z.record(z.string(), z.string()),
  git: serviceGitStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ServiceSummary = z.infer<typeof serviceSummarySchema>
