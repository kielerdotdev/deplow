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

export const registerNodeInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  provider: z.enum(["docker", "ssh"]).default("docker"),
  host: z.string().min(1).default("local"),
  port: z.number().int().optional().default(22),
  username: z.string().optional(),
  sshPrivateKey: z.string().optional(),
})

export type RegisterNodeInput = z.infer<typeof registerNodeInputSchema>

export const nodeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(["docker", "ssh", "hetzner"]),
  host: z.string(),
  status: z.enum(["online", "offline", "unknown"]),
  createdAt: z.string(),
})

export type NodeSummary = z.infer<typeof nodeSummarySchema>
