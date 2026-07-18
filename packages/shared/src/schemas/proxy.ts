import { z } from "zod"

/** How clients reach Traefik on the k3s cluster. */
export const platformEdgeModeSchema = z.enum([
  "cloudflare",
  "netbird",
  "tailscale",
  "local",
])
export type PlatformEdgeMode = z.infer<typeof platformEdgeModeSchema>

/** Operator-facing ingress status: Traefik owns Host→Service; edges only forward. */
export const proxyIngressStatusSchema = z.object({
  baseDomain: z.string(),
  baseDomainConfigured: z.boolean(),
  publicProtocol: z.enum(["https", "http"]),
  autoDomainsEnabled: z.boolean(),
  edgeMode: platformEdgeModeSchema,
  /** True when a k3s cluster is connected */
  clusterConnected: z.boolean(),
  traefikReady: z.boolean(),
  /** Host-side origin edges should target (e.g. http://127.0.0.1:80 on the server) */
  traefikOrigin: z.string(),
  /** @deprecated keep for older UI; same as traefikOrigin for k3s */
  hostOrigin: z.string(),
  /** @deprecated Caddy compose origin — unused for k3s apps */
  caddyOrigin: z.string(),
  caddyReachable: z.boolean(),
  caddyMessage: z.string().optional(),
  lastReloadOk: z.boolean().nullable(),
  lastReloadMessage: z.string().nullable(),
  lastReloadAt: z.string().nullable(),
  edgeTokenConfigured: z.boolean(),
  /** localhost base domain invalid when a cluster is connected */
  localhostBlocked: z.boolean(),
  /** Legacy mesh fields (always false/0 for k3s) */
  meshAgentsReady: z.boolean(),
  meshAgentCount: z.number().int(),
})

export type ProxyIngressStatus = z.infer<typeof proxyIngressStatusSchema>

/** Project-page hint when cluster + Domains need setup. */
export const meshOnboardingHintSchema = z.object({
  showMeshBanner: z.boolean(),
  reason: z
    .enum([
      "none",
      "localhost_with_agents",
      "mesh_not_ready",
      "no_cluster",
      "localhost_with_cluster",
    ])
    .optional(),
  meshAgentCount: z.number().int(),
  onlineAgentCount: z.number().int(),
  edgeMode: platformEdgeModeSchema,
  baseDomain: z.string(),
  clusterConnected: z.boolean().optional(),
})

export type MeshOnboardingHint = z.infer<typeof meshOnboardingHintSchema>

/** App-managed platform ingress settings (DB; env seeds once). */
export const ingressSettingsSchema = z.object({
  baseDomain: z.string(),
  publicProtocol: z.enum(["https", "http"]),
  autoDomainsEnabled: z.boolean(),
  edgeMode: platformEdgeModeSchema,
})

export type IngressSettings = z.infer<typeof ingressSettingsSchema>

/** DNS hostname / base domain: labels only (blocks Caddy injection via spaces/newlines). */
const baseDomainInputSchema = z
  .string()
  .max(253)
  .transform((s) =>
    s
      .trim()
      .toLowerCase()
      .replace(/^\.+/, "")
      .replace(/\.$/, ""),
  )
  .refine(
    (s) =>
      s.length === 0 ||
      s === "localhost" ||
      (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(
        s,
      ) &&
        !s.includes(" ") &&
        !/[\r\n\t]/.test(s)),
    { message: "baseDomain must be a valid DNS hostname" },
  )

export const updateIngressSettingsInputSchema = z.object({
  baseDomain: baseDomainInputSchema,
  publicProtocol: z.enum(["https", "http"]),
  autoDomainsEnabled: z.boolean(),
  edgeMode: platformEdgeModeSchema,
})

export type UpdateIngressSettingsInput = z.infer<
  typeof updateIngressSettingsInputSchema
>
