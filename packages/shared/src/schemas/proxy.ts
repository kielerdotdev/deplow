import { z } from "zod"

/** Operator-facing ingress status: Caddy owns Host→container; edges only forward. */
export const proxyIngressStatusSchema = z.object({
  baseDomain: z.string(),
  baseDomainConfigured: z.boolean(),
  publicProtocol: z.enum(["https", "http"]),
  autoDomainsEnabled: z.boolean(),
  /** Stable origin for all edges on the compose network */
  caddyOrigin: z.string(),
  /** Host-side origin (Tailscale Serve, local curl, etc.) */
  hostOrigin: z.string(),
  caddyReachable: z.boolean(),
  caddyMessage: z.string().optional(),
  lastReloadOk: z.boolean().nullable(),
  lastReloadMessage: z.string().nullable(),
  lastReloadAt: z.string().nullable(),
  /** Cloudflare tunnel token present in env (compose profile `edge`) */
  edgeTokenConfigured: z.boolean(),
})

export type ProxyIngressStatus = z.infer<typeof proxyIngressStatusSchema>

/** App-managed platform ingress settings (DB; env seeds once). */
export const ingressSettingsSchema = z.object({
  baseDomain: z.string(),
  publicProtocol: z.enum(["https", "http"]),
  autoDomainsEnabled: z.boolean(),
})

export type IngressSettings = z.infer<typeof ingressSettingsSchema>

export const updateIngressSettingsInputSchema = z.object({
  baseDomain: z
    .string()
    .max(253)
    .transform((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/^\.+/, "")
        .replace(/\.$/, ""),
    ),
  publicProtocol: z.enum(["https", "http"]),
  autoDomainsEnabled: z.boolean(),
})

export type UpdateIngressSettingsInput = z.infer<
  typeof updateIngressSettingsInputSchema
>
