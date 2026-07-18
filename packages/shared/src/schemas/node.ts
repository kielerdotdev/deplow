import { z } from "zod"

export const deployOptionsSchema = z.object({
  image: z.string().optional(),
  dockerCompose: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  serviceName: z.string().optional(),
  /** Host port mapping for simple image deploys, e.g. 8080 — advanced */
  publishPort: z.number().int().optional(),
  containerPort: z.number().int().optional(),
  /** Optional docker Cmd override */
  command: z.array(z.string()).optional(),
  entrypoint: z.array(z.string()).optional(),
  /** Opt out of read-only rootfs for stubborn images */
  readOnlyRootfs: z.boolean().optional(),
})

export type DeployOptions = z.infer<typeof deployOptionsSchema>

export const nodeStatusSchema = z.object({
  online: z.boolean(),
  docker: z.enum(["running", "stopped", "unknown"]).optional(),
  message: z.string().optional(),
  appRuntime: z.string().optional(),
  appRuntimeAvailable: z.boolean().optional(),
  appRuntimeRequired: z.boolean().optional(),
})

export type NodeStatus = z.infer<typeof nodeStatusSchema>

/** All nodes are agents. Future cloud providers spawn agents; they are not node kinds. */
export const nodeProviderSchema = z.literal("agent")
export type NodeProvider = z.infer<typeof nodeProviderSchema>

export const nodeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: nodeProviderSchema,
  host: z.string(),
  status: z.enum(["online", "offline", "unknown"]),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable().optional(),
  advertiseHost: z.string().nullable().optional(),
  agentVersion: z.string().nullable().optional(),
  appRuntime: z.string().optional(),
  appRuntimeAvailable: z.boolean().optional(),
  appRuntimeRequired: z.boolean().optional(),
  meshProvider: z.enum(["netbird", "tailscale"]).nullable().optional(),
  meshStatus: z.enum(["missing", "logged_out", "ready"]).nullable().optional(),
  meshIp: z.string().nullable().optional(),
  meshHostname: z.string().nullable().optional(),
  edgeMode: z.string().nullable().optional(),
  localProxyReady: z.boolean().optional(),
  meshReady: z.boolean().optional(),
  deployReady: z.boolean().optional(),
})

export type NodeSummary = z.infer<typeof nodeSummarySchema>
