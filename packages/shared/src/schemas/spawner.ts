import { z } from "zod"

export const spawnOptionsSchema = z.object({
  name: z.string().min(1),
  serverType: z.string().min(1),
  location: z.string().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  ttlMinutes: z.number().int().positive().optional(),
})

export type SpawnOptions = z.infer<typeof spawnOptionsSchema>

export const spawnedServerStatusSchema = z.enum([
  "running",
  "starting",
  "stopped",
])

export type SpawnedServerStatus = z.infer<typeof spawnedServerStatusSchema>

export const spawnedServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  ip: z.string(),
  status: spawnedServerStatusSchema,
  provider: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type SpawnedServer = z.infer<typeof spawnedServerSchema>
