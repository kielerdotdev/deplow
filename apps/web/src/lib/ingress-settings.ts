/**
 * App-managed platform ingress settings.
 * DB is source of truth; HOSTRIG_BASE_DOMAIN / protocol seed once when no row exists.
 */

import { eq, db, platformIngress } from "@hostrig/db"
import type { IngressSettings, PlatformEdgeMode } from "@hostrig/shared"

import { env } from "@/lib/env"

export const PLATFORM_INGRESS_ID = "default"

function normalizeEdgeMode(raw: unknown): PlatformEdgeMode {
  if (raw === "mesh") return "netbird"
  if (
    raw === "cloudflare" ||
    raw === "netbird" ||
    raw === "tailscale" ||
    raw === "local"
  ) {
    return raw
  }
  return "local"
}

function settingsFromEnv(): IngressSettings {
  const baseDomain = env.baseDomain
  const isLocalhost =
    baseDomain === "localhost" ||
    baseDomain.endsWith(".localhost") ||
    baseDomain.length === 0
  return {
    baseDomain,
    publicProtocol: env.publicUrlProtocol,
    autoDomainsEnabled: baseDomain.length > 0,
    edgeMode: isLocalhost ? "local" : "cloudflare",
  }
}

function rowToSettings(row: {
  baseDomain: string
  publicProtocol: string
  autoDomainsEnabled: boolean
  edgeMode?: string | null
}): IngressSettings {
  const protocol =
    row.publicProtocol === "http" || row.publicProtocol === "https"
      ? row.publicProtocol
      : "https"
  return {
    baseDomain: (row.baseDomain ?? "").trim(),
    publicProtocol: protocol,
    autoDomainsEnabled: Boolean(row.autoDomainsEnabled),
    edgeMode: normalizeEdgeMode(row.edgeMode),
  }
}

/**
 * Load ingress settings. Seeds from env on first boot when no DB row exists.
 */
export async function loadIngressSettings(): Promise<IngressSettings> {
  const [row] = await db
    .select()
    .from(platformIngress)
    .where(eq(platformIngress.id, PLATFORM_INGRESS_ID))

  if (row) {
    return rowToSettings(row)
  }

  const seeded = settingsFromEnv()
  await db.insert(platformIngress).values({
    id: PLATFORM_INGRESS_ID,
    baseDomain: seeded.baseDomain,
    publicProtocol: seeded.publicProtocol,
    autoDomainsEnabled: seeded.autoDomainsEnabled,
    edgeMode: seeded.edgeMode,
  })
  return seeded
}

export function isLocalhostBaseDomain(baseDomain: string): boolean {
  const d = baseDomain.trim().toLowerCase()
  return (
    d === "localhost" ||
    d.endsWith(".localhost") ||
    d === "apps.localhost"
  )
}

export async function saveIngressSettings(
  input: IngressSettings,
): Promise<IngressSettings> {
  const settings: IngressSettings = {
    baseDomain: (input.baseDomain ?? "").trim(),
    publicProtocol: input.publicProtocol,
    autoDomainsEnabled: input.autoDomainsEnabled,
    edgeMode: normalizeEdgeMode(input.edgeMode),
  }

  const [existing] = await db
    .select()
    .from(platformIngress)
    .where(eq(platformIngress.id, PLATFORM_INGRESS_ID))

  if (existing) {
    await db
      .update(platformIngress)
      .set({
        baseDomain: settings.baseDomain,
        publicProtocol: settings.publicProtocol,
        autoDomainsEnabled: settings.autoDomainsEnabled,
        edgeMode: settings.edgeMode,
      })
      .where(eq(platformIngress.id, PLATFORM_INGRESS_ID))
  } else {
    await db.insert(platformIngress).values({
      id: PLATFORM_INGRESS_ID,
      baseDomain: settings.baseDomain,
      publicProtocol: settings.publicProtocol,
      autoDomainsEnabled: settings.autoDomainsEnabled,
      edgeMode: settings.edgeMode,
    })
  }

  return settings
}
