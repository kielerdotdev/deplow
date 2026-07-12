import { z } from "zod"

import { gitAuthMethodSchema, gitProviderSchema } from "./project"

const serviceNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
    message: "Use lowercase letters, numbers, and hyphens",
  })

export const serviceTypeSchema = z.enum([
  "web",
  "worker",
  "postgres",
  "redis",
])
export type ServiceType = z.infer<typeof serviceTypeSchema>

export const serviceStatusSchema = z.enum([
  "queued",
  "provisioning",
  "deploying",
  "running",
  "stopped",
  "error",
  "destroying",
  "ready",
])
export type ServiceStatus = z.infer<typeof serviceStatusSchema>

export const buildStrategyOverrideSchema = z.enum([
  "auto",
  "railpack",
  "dockerfile",
])
export type BuildStrategyOverride = z.infer<typeof buildStrategyOverrideSchema>

export const analysisFingerprintSchema = z.object({
  repoUrl: z.string().min(1),
  branch: z.string().min(1),
  rootDirectory: z.string().default("."),
  dockerfilePath: z.string().nullable(),
})
export type AnalysisFingerprint = z.infer<typeof analysisFingerprintSchema>

export const createServiceInputSchema = z.object({
  projectId: z.string().min(1),
  name: serviceNameSchema,
  type: serviceTypeSchema.default("web"),
  containerPort: z.number().int().min(1).max(65_535).default(80),
  /** When true (default for web/worker with git), enqueue deploy after create */
  deploy: z.boolean().optional(),
})
export type CreateServiceInput = z.infer<typeof createServiceInputSchema>

export const analyzeSourceInputSchema = z.object({
  provider: gitProviderSchema,
  repoUrl: z.string().url(),
  branch: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9._\-/]+$/)
    .default("main"),
  repoFullName: z.string().min(1).max(256).optional(),
  rootDirectory: z.string().max(512).optional(),
  dockerfilePath: z.string().max(512).nullable().optional(),
  strategyOverride: buildStrategyOverrideSchema.optional(),
  authMethod: gitAuthMethodSchema.optional(),
  installationId: z.string().min(1).optional(),
  accessToken: z.string().min(1).optional(),
})
export type AnalyzeSourceInput = z.infer<typeof analyzeSourceInputSchema>

export const sourceAnalysisResultSchema = z.object({
  analysisId: z.string(),
  fingerprint: analysisFingerprintSchema,
  strategy: z.enum(["railpack", "dockerfile"]).nullable(),
  dockerfilePath: z.string().nullable(),
  applicationRoot: z.string(),
  runtime: z.string().nullable(),
  framework: z.string().nullable(),
  startCommand: z.string().nullable(),
  buildCommand: z.string().nullable(),
  suggestedName: z.string(),
  suggestedType: z.enum(["web", "worker"]),
  typeConfidence: z.enum(["high", "low"]),
  needsChoice: z.enum(["dockerfile", "application"]).nullable(),
  dockerfiles: z.array(z.string()),
  applications: z.array(z.string()),
  errors: z.array(z.string()),
})
export type SourceAnalysisResultDto = z.infer<typeof sourceAnalysisResultSchema>

export const createAndDeployServiceInputSchema = z.object({
  projectId: z.string().min(1),
  name: serviceNameSchema,
  type: z.enum(["web", "worker"]).default("web"),
  containerPort: z.number().int().min(1).max(65_535).optional(),
  analysisId: z.string().min(1),
  fingerprint: analysisFingerprintSchema,
  provider: gitProviderSchema,
  repoUrl: z.string().url(),
  branch: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9._\-/]+$/)
    .default("main"),
  repoFullName: z.string().min(1).max(256).optional(),
  authMethod: gitAuthMethodSchema.optional(),
  installationId: z.string().min(1).optional(),
  accessToken: z.string().min(1).optional(),
  rootDirectory: z.string().max(512).optional(),
  buildStrategyOverride: buildStrategyOverrideSchema.optional(),
  dockerfilePath: z.string().max(512).nullable().optional(),
  buildCommand: z.string().max(1024).nullable().optional(),
  startCommand: z.string().max(1024).nullable().optional(),
  healthCheckPath: z.string().max(512).nullable().optional(),
  autoWebhook: z.boolean().optional().default(true),
})
export type CreateAndDeployServiceInput = z.infer<
  typeof createAndDeployServiceInputSchema
>

export const updateServiceInputSchema = z.object({
  id: z.string().min(1),
  containerPort: z.number().int().min(1).max(65_535).optional(),
  isPrimary: z.boolean().optional(),
  env: z.record(z.string(), z.string()).optional(),
  rootDirectory: z.string().max(512).nullable().optional(),
  buildStrategyOverride: buildStrategyOverrideSchema.nullable().optional(),
  dockerfilePath: z.string().max(512).nullable().optional(),
  buildCommand: z.string().max(1024).nullable().optional(),
  startCommand: z.string().max(1024).nullable().optional(),
  healthCheckPath: z.string().max(512).nullable().optional(),
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

export const createBindingInputSchema = z.object({
  consumerServiceId: z.string().min(1),
  providerServiceId: z.string().min(1),
  envKey: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Z][A-Z0-9_]*$/, {
      message: "Env key must be UPPER_SNAKE_CASE",
    }),
  principal: z.string().max(128).optional(),
})
export type CreateBindingInput = z.infer<typeof createBindingInputSchema>

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
  errorCode: z.string().nullable().optional(),
  lastOperationId: z.string().nullable().optional(),
  env: z.record(z.string(), z.string()),
  rootDirectory: z.string().nullable().optional(),
  buildStrategyOverride: buildStrategyOverrideSchema.nullable().optional(),
  dockerfilePath: z.string().nullable().optional(),
  buildCommand: z.string().nullable().optional(),
  startCommand: z.string().nullable().optional(),
  healthCheckPath: z.string().nullable().optional(),
  git: serviceGitStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ServiceSummary = z.infer<typeof serviceSummarySchema>
