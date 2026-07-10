import { z } from "zod"

export const createProjectInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
      message: "Use lowercase letters, numbers, and hyphens",
    }),
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

export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: projectStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  errorMessage: z.string().nullable().optional(),
})

export type ProjectSummary = z.infer<typeof projectSummarySchema>

export const projectDetailSchema = projectSummarySchema.extend({
  secretsYaml: z.string().nullable().optional(),
  hasCredentials: z.boolean(),
  backupIntervalMs: z.number().int().optional(),
  lastBackupAt: z.string().nullable().optional(),
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

export const projectCredentialsSchema = z.object({
  database: databaseCredentialsSchema,
  redis: redisCredentialsSchema,
  storage: storageCredentialsSchema,
})

export type ProjectCredentials = z.infer<typeof projectCredentialsSchema>
