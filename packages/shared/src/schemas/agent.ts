import { z } from "zod"

export const agentJobTypeSchema = z.enum([
  "deploy",
  "provision",
  "destroy",
  "stop",
  "logs",
])
export type AgentJobType = z.infer<typeof agentJobTypeSchema>

export const agentJobStatusSchema = z.enum([
  "pending",
  "claimed",
  "running",
  "succeeded",
  "failed",
])
export type AgentJobStatus = z.infer<typeof agentJobStatusSchema>

export const agentGitAuthSchema = z.object({
  token: z.string().optional(),
  username: z.string().optional(),
  provider: z.string().optional(),
})
export type AgentGitAuth = z.infer<typeof agentGitAuthSchema>

export const agentDeployJobPayloadSchema = z.object({
  operationId: z.string(),
  deploymentId: z.string(),
  serviceId: z.string(),
  projectId: z.string(),
  nodeId: z.string(),
  serviceName: z.string(),
  serviceType: z.enum(["web", "worker"]),
  containerPort: z.number().int().optional(),
  fromGit: z.boolean().optional(),
  image: z.string().optional(),
  sourcePath: z.string().optional(),
  gitRepoUrl: z.string().optional(),
  gitBranch: z.string().optional(),
  gitAuth: agentGitAuthSchema.optional(),
  buildStrategyOverride: z
    .enum(["auto", "railpack", "dockerfile"])
    .nullable()
    .optional(),
  dockerfilePath: z.string().nullable().optional(),
  rootDirectory: z.string().nullable().optional(),
  buildCommand: z.string().nullable().optional(),
  startCommand: z.string().nullable().optional(),
  healthCheckPath: z.string().nullable().optional(),
  env: z.record(z.string(), z.string()).optional(),
  options: z
    .object({
      publishPort: z.number().int().optional(),
      containerPort: z.number().int().optional(),
      command: z.array(z.string()).optional(),
      entrypoint: z.array(z.string()).optional(),
      readOnlyRootfs: z.boolean().optional(),
    })
    .optional(),
  projectSlug: z.string(),
})
export type AgentDeployJobPayload = z.infer<typeof agentDeployJobPayloadSchema>

export const agentStopJobPayloadSchema = z.object({
  serviceName: z.string(),
  nodeId: z.string(),
})
export type AgentStopJobPayload = z.infer<typeof agentStopJobPayloadSchema>

export const agentDestroyJobPayloadSchema = z.object({
  serviceName: z.string(),
  nodeId: z.string(),
  projectId: z.string().optional(),
})
export type AgentDestroyJobPayload = z.infer<typeof agentDestroyJobPayloadSchema>

export const agentJoinRequestSchema = z.object({
  joinToken: z.string().min(16),
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
    .optional(),
  advertiseHost: z.string().min(1).optional(),
  agentVersion: z.string().optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
})
export type AgentJoinRequest = z.infer<typeof agentJoinRequestSchema>

export const agentJoinResponseSchema = z.object({
  nodeId: z.string(),
  nodeToken: z.string(),
  name: z.string(),
})
export type AgentJoinResponse = z.infer<typeof agentJoinResponseSchema>

export const agentHeartbeatRequestSchema = z.object({
  advertiseHost: z.string().min(1).optional(),
  agentVersion: z.string().optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  appRuntime: z.string().optional(),
  appRuntimeAvailable: z.boolean().optional(),
})
export type AgentHeartbeatRequest = z.infer<typeof agentHeartbeatRequestSchema>

export const agentHeartbeatResponseSchema = z.object({
  ok: z.literal(true),
  nodeId: z.string(),
  status: z.enum(["online", "offline", "unknown"]),
})
export type AgentHeartbeatResponse = z.infer<typeof agentHeartbeatResponseSchema>

export const agentClaimRequestSchema = z.object({
  waitMs: z.number().int().min(0).max(60_000).optional().default(25_000),
})
export type AgentClaimRequest = z.infer<typeof agentClaimRequestSchema>

export const agentClaimedJobSchema = z.object({
  id: z.string(),
  type: agentJobTypeSchema,
  payload: z.unknown(),
  leaseExpiresAt: z.string(),
})
export type AgentClaimedJob = z.infer<typeof agentClaimedJobSchema>

export const agentClaimResponseSchema = z.object({
  job: agentClaimedJobSchema.nullable(),
})
export type AgentClaimResponse = z.infer<typeof agentClaimResponseSchema>

export const agentJobProgressSchema = z.object({
  stage: z.string().optional(),
  buildLogs: z.string().optional(),
  message: z.string().optional(),
})
export type AgentJobProgress = z.infer<typeof agentJobProgressSchema>

export const agentJobCompleteSchema = z.object({
  ok: z.boolean(),
  result: z
    .object({
      containerId: z.string().optional(),
      image: z.string().optional(),
      publishedPort: z.number().int().optional(),
      advertiseHost: z.string().optional(),
      upstream: z.string().optional(),
      buildLogs: z.string().optional(),
      gitSha: z.string().nullable().optional(),
      buildStrategy: z.string().optional(),
      logs: z.string().optional(),
    })
    .optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
      stage: z.string().optional(),
    })
    .optional(),
})
export type AgentJobComplete = z.infer<typeof agentJobCompleteSchema>

export const createJoinTokenInputSchema = z.object({
  label: z.string().max(128).optional(),
  /** TTL seconds; default 3600 */
  ttlSeconds: z.number().int().min(60).max(86_400).optional().default(3600),
  /** Suggested node name when redeemed */
  suggestedName: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
    .optional(),
})
export type CreateJoinTokenInput = z.infer<typeof createJoinTokenInputSchema>
