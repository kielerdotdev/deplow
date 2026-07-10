import { z } from "zod"

export const createProjectInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
      message: "Use lowercase letters, numbers, and hyphens",
    }),
  /** Optional git repository URL to connect after create */
  gitRepoUrl: z.string().url().optional().or(z.literal("")),
  /** @deprecated escape hatch — hidden from happy-path UI */
  spawnBuildServer: z.boolean().optional().default(false),
})

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>

export const projectStatusSchema = z.enum([
  "provisioning",
  "ready",
  "error",
  "destroying",
])

export type ProjectStatus = z.infer<typeof projectStatusSchema>

export const gitProviderSchema = z.enum(["github", "gitlab"])

export type GitProvider = z.infer<typeof gitProviderSchema>

export const connectGitInputSchema = z.object({
  projectId: z.string().min(1),
  provider: gitProviderSchema,
  repoUrl: z.string().url(),
  branch: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9._\-/]+$/)
    .default("main"),
  /** Optional; generated if omitted */
  webhookSecret: z.string().min(8).max(256).optional(),
})

export type ConnectGitInput = z.infer<typeof connectGitInputSchema>

export const listGitReposInputSchema = z.object({
  provider: gitProviderSchema,
  /** PAT — if omitted, server uses DEPLOW_GITHUB_TOKEN / DEPLOW_GITLAB_TOKEN */
  token: z.string().min(1).optional(),
  query: z.string().max(200).optional(),
})

export type ListGitReposInput = z.infer<typeof listGitReposInputSchema>

export const gitRemoteRepoSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  name: z.string(),
  owner: z.string(),
  description: z.string().nullable(),
  private: z.boolean(),
  defaultBranch: z.string(),
  cloneUrl: z.string(),
  htmlUrl: z.string(),
  updatedAt: z.string().nullable(),
})

export type GitRemoteRepo = z.infer<typeof gitRemoteRepoSchema>

export const listGitBranchesInputSchema = z.object({
  provider: gitProviderSchema,
  fullName: z.string().min(1),
  token: z.string().min(1).optional(),
})

export type ListGitBranchesInput = z.infer<typeof listGitBranchesInputSchema>

export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: projectStatusSchema,
  nodeId: z.string().nullable().optional(),
  publicUrl: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  errorMessage: z.string().nullable().optional(),
})

export type ProjectSummary = z.infer<typeof projectSummarySchema>

export const projectGitStatusSchema = z.object({
  connected: z.boolean(),
  provider: gitProviderSchema.nullable().optional(),
  repoUrl: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  webhookUrl: z.string().nullable().optional(),
  lastDeliveryAt: z.string().nullable().optional(),
  lastDeliveryStatus: z.string().nullable().optional(),
  lastDeliveryError: z.string().nullable().optional(),
  connectedAt: z.string().nullable().optional(),
})

export type ProjectGitStatus = z.infer<typeof projectGitStatusSchema>

export const projectDetailSchema = projectSummarySchema.extend({
  secretsYaml: z.string().nullable().optional(),
  hasCredentials: z.boolean(),
  backupIntervalMs: z.number().int().optional(),
  lastBackupAt: z.string().nullable().optional(),
  git: projectGitStatusSchema.optional(),
})

export type ProjectDetail = z.infer<typeof projectDetailSchema>

export const databaseCredentialsSchema = z.object({
  host: z.string(),
  port: z.number().int(),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  url: z.string().optional(),
})

export type DatabaseCredentials = z.infer<typeof databaseCredentialsSchema>

export const redisCredentialsSchema = z.object({
  host: z.string(),
  port: z.number().int(),
  password: z.string().optional(),
  namespace: z.string().optional(),
  url: z.string().optional(),
})

export type RedisCredentials = z.infer<typeof redisCredentialsSchema>

export const storageCredentialsSchema = z.object({
  endpoint: z.string(),
  bucket: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  region: z.string().optional(),
})

export type StorageCredentials = z.infer<typeof storageCredentialsSchema>

/** Production-slot credentials (v1). Preview slots will be a separate structure. */
export const projectCredentialsSchema = z.object({
  database: databaseCredentialsSchema,
  redis: redisCredentialsSchema,
  storage: storageCredentialsSchema,
  /** Slot kind — always production in v1 when present */
  slotKind: z.literal("production").optional(),
})

export type ProjectCredentials = z.infer<typeof projectCredentialsSchema>
