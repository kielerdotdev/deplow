import { z } from "zod"

export const netbirdDomainModeSchema = z.enum(["managed", "custom"])
export type NetbirdDomainMode = z.infer<typeof netbirdDomainModeSchema>

export const netbirdStatusSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "error",
])
export type NetbirdStatus = z.infer<typeof netbirdStatusSchema>

export const netbirdManagedDomainSchema = z.object({
  id: z.string(),
  domain: z.string(),
  validated: z.boolean(),
  type: z.string(),
  targetCluster: z.string().optional(),
})
export type NetbirdManagedDomain = z.infer<typeof netbirdManagedDomainSchema>

export const netbirdEdgeStatusSchema = z.object({
  status: netbirdStatusSchema,
  statusMessage: z.string().nullable(),
  managementUrl: z.string(),
  domainMode: netbirdDomainModeSchema,
  baseDomain: z.string(),
  peerId: z.string().nullable(),
  peerName: z.string().nullable(),
  peerConnected: z.boolean().nullable(),
  hasPat: z.boolean(),
  dnsHint: z.string().nullable(),
  clusterReady: z.boolean(),
  traefikReady: z.boolean(),
})
export type NetbirdEdgeStatus = z.infer<typeof netbirdEdgeStatusSchema>

export const netbirdConnectInputSchema = z.object({
  managementUrl: z
    .string()
    .url()
    .max(512)
    .transform((s) => s.trim().replace(/\/+$/, "")),
  pat: z.string().min(8).max(4096).transform((s) => s.trim()),
  domainMode: netbirdDomainModeSchema,
  /** Required for custom; for managed pick from listManagedDomains */
  baseDomain: z
    .string()
    .max(253)
    .transform((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/^\.+/, "")
        .replace(/\.$/, ""),
    )
    .optional(),
})
export type NetbirdConnectInput = z.infer<typeof netbirdConnectInputSchema>

export const netbirdListDomainsInputSchema = z.object({
  managementUrl: z
    .string()
    .url()
    .max(512)
    .transform((s) => s.trim().replace(/\/+$/, "")),
  pat: z.string().min(8).max(4096).transform((s) => s.trim()),
})
export type NetbirdListDomainsInput = z.infer<
  typeof netbirdListDomainsInputSchema
>
