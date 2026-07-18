import { z } from "zod"

export const spawnOptionsSchema = z.object({
  name: z.string().min(1),
  serverType: z.string().min(1),
  location: z.string().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  ttlMinutes: z.number().int().positive().optional(),
  /** Control plane base URL the agent will join (required for Hetzner bootstrap). */
  controlPlaneUrl: z.string().url().optional(),
  /** One-time join token plaintext (required for Hetzner bootstrap). */
  joinToken: z.string().min(1).optional(),
  nodeName: z.string().min(1).optional(),
  agentImage: z.string().min(1).optional(),
  /** Default runc for first-cut cloud spawn; runsc needs gVisor on the image. */
  appRuntime: z.enum(["runsc", "runc"]).optional(),
  /** When set, used as cloud-init instead of agent/k3s helpers. */
  userData: z.string().min(1).optional(),
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
