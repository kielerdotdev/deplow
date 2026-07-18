import { z } from "zod"

export const registryKindSchema = z.enum([
  "ghcr",
  "dockerhub",
  "gitlab",
  "generic",
])
export type RegistryKind = z.infer<typeof registryKindSchema>

/** Public row — never includes password material. */
export const containerRegistrySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: registryKindSchema,
  server: z.string(),
  imagePrefix: z.string(),
  username: z.string().nullable(),
  hasPassword: z.boolean(),
  isDefaultBuild: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ContainerRegistry = z.infer<typeof containerRegistrySchema>

export const createRegistryInputSchema = z.object({
  name: z.string().min(1).max(64),
  kind: registryKindSchema,
  /** Required for gitlab/generic; ignored (defaults applied) for ghcr/dockerhub. */
  server: z.string().min(1).max(253).optional(),
  /** e.g. ghcr.io/myorg/hostrig — where images are pushed. */
  imagePrefix: z.string().min(1).max(253),
  username: z.string().max(253).optional().nullable(),
  password: z.string().max(4096).optional().nullable(),
  isDefaultBuild: z.boolean().optional(),
  enabled: z.boolean().optional(),
})
export type CreateRegistryInput = z.infer<typeof createRegistryInputSchema>

export const updateRegistryInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64).optional(),
  kind: registryKindSchema.optional(),
  server: z.string().min(1).max(253).optional(),
  imagePrefix: z.string().min(1).max(253).optional(),
  username: z.string().max(253).optional().nullable(),
  /** Omit or null to leave unchanged; empty string clears. */
  password: z.string().max(4096).optional().nullable(),
  isDefaultBuild: z.boolean().optional(),
  enabled: z.boolean().optional(),
})
export type UpdateRegistryInput = z.infer<typeof updateRegistryInputSchema>

export const setDefaultBuildRegistryInputSchema = z.object({
  id: z.string().min(1),
})
export type SetDefaultBuildRegistryInput = z.infer<
  typeof setDefaultBuildRegistryInputSchema
>

export const deleteRegistryInputSchema = z.object({
  id: z.string().min(1),
})

export const registrySyncResultSchema = z.object({
  namespaces: z.number().int(),
  secrets: z.number().int(),
  errors: z.array(z.string()),
})
export type RegistrySyncResult = z.infer<typeof registrySyncResultSchema>
