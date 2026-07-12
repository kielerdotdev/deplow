import { z } from "zod"

import {
  databaseCredentialsSchema,
  redisCredentialsSchema,
  storageCredentialsSchema,
} from "./project"

export const resourceKindSchema = z.enum(["postgres", "redis", "s3"])
export type ResourceKind = z.infer<typeof resourceKindSchema>

export const resourceSourceSchema = z.enum([
  "shared-instance",
  "dedicated-container",
  "external",
])
export type ResourceSource = z.infer<typeof resourceSourceSchema>

export const resourceLinkStatusSchema = z.enum([
  "provisioning",
  "ready",
  "error",
])

export const resourceCredentialsSchema = z.union([
  databaseCredentialsSchema,
  redisCredentialsSchema,
  storageCredentialsSchema,
])
export type ResourceCredentials = z.infer<typeof resourceCredentialsSchema>

export const resourceLinkSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: resourceKindSchema,
  source: resourceSourceSchema,
  status: resourceLinkStatusSchema,
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ResourceLinkSummary = z.infer<typeof resourceLinkSummarySchema>

export const createResourceLinkInputSchema = z.object({
  projectId: z.string().min(1),
  kind: resourceKindSchema,
})
