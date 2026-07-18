import { eq, sql, db, platformIngress, netbirdServices } from "@hostrig/db"
import type { NetbirdDomainMode, NetbirdStatus } from "@hostrig/shared"

import { decryptString, encryptString } from "@/lib/core/crypto"
import { env } from "@/lib/env"
import { PLATFORM_INGRESS_ID } from "@/lib/ingress-settings"

export type NetbirdEdgeRow = {
  netbirdManagementUrl: string | null
  netbirdPatEncrypted: string | null
  netbirdSetupKeyId: string | null
  netbirdPeerId: string | null
  netbirdPeerName: string | null
  netbirdDomainMode: string | null
  netbirdStatus: string
  netbirdStatusMessage: string | null
  baseDomain: string
  edgeMode: string
}

export async function loadNetbirdEdgeRow(): Promise<NetbirdEdgeRow | null> {
  const [row] = await db
    .select()
    .from(platformIngress)
    .where(eq(platformIngress.id, PLATFORM_INGRESS_ID))
  if (!row) return null
  return {
    netbirdManagementUrl: row.netbirdManagementUrl ?? null,
    netbirdPatEncrypted: row.netbirdPatEncrypted ?? null,
    netbirdSetupKeyId: row.netbirdSetupKeyId ?? null,
    netbirdPeerId: row.netbirdPeerId ?? null,
    netbirdPeerName: row.netbirdPeerName ?? null,
    netbirdDomainMode: row.netbirdDomainMode ?? null,
    netbirdStatus: row.netbirdStatus ?? "disconnected",
    netbirdStatusMessage: row.netbirdStatusMessage ?? null,
    baseDomain: row.baseDomain,
    edgeMode: row.edgeMode,
  }
}

export function decryptPat(encrypted: string): string {
  return decryptString(encrypted, env.secretsEncryptionKey)
}

export function encryptPat(pat: string): string {
  return encryptString(pat, env.secretsEncryptionKey)
}

export async function updateNetbirdEdge(fields: {
  managementUrl?: string
  patEncrypted?: string | null
  setupKeyId?: string | null
  peerId?: string | null
  peerName?: string | null
  domainMode?: NetbirdDomainMode
  status?: NetbirdStatus
  statusMessage?: string | null
  baseDomain?: string
  edgeMode?: "netbird" | "local" | "cloudflare" | "tailscale"
  autoDomainsEnabled?: boolean
}): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (fields.managementUrl !== undefined) {
    patch.netbirdManagementUrl = fields.managementUrl
  }
  if (fields.patEncrypted !== undefined) {
    patch.netbirdPatEncrypted = fields.patEncrypted
  }
  if (fields.setupKeyId !== undefined) {
    patch.netbirdSetupKeyId = fields.setupKeyId
  }
  if (fields.peerId !== undefined) patch.netbirdPeerId = fields.peerId
  if (fields.peerName !== undefined) patch.netbirdPeerName = fields.peerName
  if (fields.domainMode !== undefined) {
    patch.netbirdDomainMode = fields.domainMode
  }
  if (fields.status !== undefined) patch.netbirdStatus = fields.status
  if (fields.statusMessage !== undefined) {
    patch.netbirdStatusMessage = fields.statusMessage
  }
  if (fields.baseDomain !== undefined) patch.baseDomain = fields.baseDomain
  if (fields.edgeMode !== undefined) patch.edgeMode = fields.edgeMode
  if (fields.autoDomainsEnabled !== undefined) {
    patch.autoDomainsEnabled = fields.autoDomainsEnabled
  }

  const [existing] = await db
    .select()
    .from(platformIngress)
    .where(eq(platformIngress.id, PLATFORM_INGRESS_ID))

  if (existing) {
    await db
      .update(platformIngress)
      .set(patch)
      .where(eq(platformIngress.id, PLATFORM_INGRESS_ID))
  } else {
    await db.insert(platformIngress).values({
      id: PLATFORM_INGRESS_ID,
      baseDomain: fields.baseDomain ?? "",
      publicProtocol: "https",
      autoDomainsEnabled: fields.autoDomainsEnabled ?? true,
      edgeMode: fields.edgeMode ?? "local",
      netbirdManagementUrl: fields.managementUrl ?? "https://api.netbird.io",
      netbirdPatEncrypted: fields.patEncrypted ?? null,
      netbirdSetupKeyId: fields.setupKeyId ?? null,
      netbirdPeerId: fields.peerId ?? null,
      netbirdPeerName: fields.peerName ?? null,
      netbirdDomainMode: fields.domainMode ?? "managed",
      netbirdStatus: fields.status ?? "disconnected",
      netbirdStatusMessage: fields.statusMessage ?? null,
    })
  }
}

export async function upsertNetbirdServiceMap(input: {
  hostname: string
  serviceId?: string | null
  netbirdServiceId: string
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(netbirdServices)
    .where(eq(netbirdServices.hostname, input.hostname))

  if (existing) {
    await db
      .update(netbirdServices)
      .set({
        netbirdServiceId: input.netbirdServiceId,
        serviceId: input.serviceId ?? existing.serviceId,
      })
      .where(eq(netbirdServices.id, existing.id))
    return
  }

  await db.insert(netbirdServices).values({
    id: crypto.randomUUID(),
    hostname: input.hostname,
    serviceId: input.serviceId ?? null,
    netbirdServiceId: input.netbirdServiceId,
  })
}

export async function getNetbirdServiceMap(
  hostname: string,
): Promise<{ netbirdServiceId: string; id: string } | null> {
  const [row] = await db
    .select()
    .from(netbirdServices)
    .where(eq(netbirdServices.hostname, hostname))
  if (!row) return null
  return { netbirdServiceId: row.netbirdServiceId, id: row.id }
}

export async function deleteAllNetbirdServiceMaps(): Promise<
  Array<{ hostname: string; netbirdServiceId: string }>
> {
  const rows = await db.select().from(netbirdServices)
  if (rows.length > 0) {
    await db.delete(netbirdServices).where(sql`1 = 1`)
  }
  return rows.map((r) => ({
    hostname: r.hostname,
    netbirdServiceId: r.netbirdServiceId,
  }))
}

export async function listNetbirdServiceMapsForService(
  serviceId: string,
): Promise<Array<{ id: string; hostname: string; netbirdServiceId: string }>> {
  const rows = await db
    .select()
    .from(netbirdServices)
    .where(eq(netbirdServices.serviceId, serviceId))
  return rows.map((r) => ({
    id: r.id,
    hostname: r.hostname,
    netbirdServiceId: r.netbirdServiceId,
  }))
}

export async function listNetbirdServiceMapsForHostnames(
  hostnames: string[],
): Promise<Array<{ id: string; hostname: string; netbirdServiceId: string }>> {
  if (hostnames.length === 0) return []
  const normalized = hostnames.map((h) => h.trim().toLowerCase())
  const rows = await db.select().from(netbirdServices)
  return rows
    .filter((r) => normalized.includes(r.hostname.toLowerCase()))
    .map((r) => ({
      id: r.id,
      hostname: r.hostname,
      netbirdServiceId: r.netbirdServiceId,
    }))
}

export async function deleteNetbirdServiceMapById(id: string): Promise<void> {
  await db.delete(netbirdServices).where(eq(netbirdServices.id, id))
}
