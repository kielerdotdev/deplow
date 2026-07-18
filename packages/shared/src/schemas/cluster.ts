import { z } from "zod"

export const clusterStatusSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "provisioning",
  "error",
])
export type ClusterStatus = z.infer<typeof clusterStatusSchema>

/** `hetzner_k3s` is legacy DB rows only — treated as unmanaged. */
export const clusterSourceSchema = z.enum(["byo", "hetzner", "hetzner_k3s"])
export type ClusterSource = z.infer<typeof clusterSourceSchema>

export const clusterNodeSchema = z.object({
  name: z.string(),
  roles: z.array(z.string()),
  ready: z.boolean(),
  version: z.string().optional(),
  internalIp: z.string().nullable().optional(),
  externalIp: z.string().nullable().optional(),
  capacityCpu: z.string().optional(),
  capacityMemory: z.string().optional(),
  /** True when this node can be removed via the managed provider. */
  removable: z.boolean().optional(),
})
export type ClusterNode = z.infer<typeof clusterNodeSchema>

export const managedClusterCapabilitiesSchema = z.object({
  canCreate: z.boolean(),
  canAddNode: z.boolean(),
  canRemoveNode: z.boolean(),
  canViewKubeconfig: z.boolean(),
  canDestroy: z.boolean(),
})
export type ManagedClusterCapabilities = z.infer<
  typeof managedClusterCapabilitiesSchema
>

/** Reserved for future async ops. Always null in the current product. */
export const clusterOperationSchema = z.object({
  kind: z.enum(["create", "scale_up", "scale_down", "reconcile"]),
  message: z.string(),
  startedAt: z.string().nullable(),
  targetWorkerCount: z.number().int().nullable().optional(),
  busy: z.boolean(),
})
export type ClusterOperation = z.infer<typeof clusterOperationSchema>

export const clusterSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: clusterStatusSchema,
  source: clusterSourceSchema.nullable(),
  serverUrl: z.string().nullable(),
  externalIp: z.string().nullable(),
  errorMessage: z.string().nullable(),
  nodeCount: z.number().int(),
  readyNodeCount: z.number().int(),
  traefikReady: z.boolean(),
  /** Origin for Cloudflare / Netbird / Tailscale on the k3s server host */
  traefikOrigin: z.string(),
  edgeCommands: z.object({
    netbird: z.string(),
    tailscale: z.string(),
    cloudflareOrigin: z.string(),
  }),
  nodes: z.array(clusterNodeSchema),
  hetznerConfigured: z.boolean(),
  managed: managedClusterCapabilitiesSchema,
  operation: clusterOperationSchema.nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})
export type ClusterSummary = z.infer<typeof clusterSummarySchema>

export const connectClusterInputSchema = z.object({
  kubeconfig: z.string().min(32).max(512_000),
  name: z.string().min(1).max(64).optional(),
  /** Optional k3s node-token so self-hosted workers can join later. */
  nodeToken: z.string().min(8).max(4096).optional(),
})
export type ConnectClusterInput = z.infer<typeof connectClusterInputSchema>

export const storeClusterJoinTokenInputSchema = z.object({
  nodeToken: z.string().min(8).max(4096),
})
export type StoreClusterJoinTokenInput = z.infer<
  typeof storeClusterJoinTokenInputSchema
>

export const workerJoinScriptInputSchema = z.object({
  nodeName: z.string().min(1).max(64).optional(),
})
export type WorkerJoinScriptInput = z.infer<typeof workerJoinScriptInputSchema>

export const workerJoinScriptSchema = z.object({
  serverUrl: z.string(),
  token: z.string(),
  nodeName: z.string(),
  script: z.string(),
})
export type WorkerJoinScript = z.infer<typeof workerJoinScriptSchema>

export const createHetznerClusterInputSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  serverType: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
})
export type CreateHetznerClusterInput = z.infer<
  typeof createHetznerClusterInputSchema
>

export const addClusterNodeInputSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  serverType: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
})
export type AddClusterNodeInput = z.infer<typeof addClusterNodeInputSchema>

export const removeClusterNodeInputSchema = z.object({
  nodeName: z.string().min(1).max(253),
})
export type RemoveClusterNodeInput = z.infer<typeof removeClusterNodeInputSchema>

export const clusterKubeconfigSchema = z.object({
  kubeconfig: z.string(),
  name: z.string(),
  source: clusterSourceSchema.nullable(),
})
export type ClusterKubeconfig = z.infer<typeof clusterKubeconfigSchema>
