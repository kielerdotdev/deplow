import { z } from "zod"

export const projectEnvSecretKeySchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: "Use letters, numbers, and underscores; start with a letter or underscore",
  })

export const projectEnvSecretEntrySchema = z.object({
  key: projectEnvSecretKeySchema,
  value: z.string().max(8192),
})

export type ProjectEnvSecretEntry = z.infer<typeof projectEnvSecretEntrySchema>

export const saveProjectEnvSecretsInputSchema = z.object({
  id: z.string().min(1),
  entries: z.array(projectEnvSecretEntrySchema).max(256),
})

export type SaveProjectEnvSecretsInput = z.infer<
  typeof saveProjectEnvSecretsInputSchema
>

export const listProjectEnvSecretsInputSchema = z.object({
  id: z.string().min(1),
  reveal: z.boolean().optional().default(false),
})

export type ListProjectEnvSecretsInput = z.infer<
  typeof listProjectEnvSecretsInputSchema
>
