/**
 * App-managed platform ingress settings.
 * DB is source of truth; DEPLOW_BASE_DOMAIN / protocol seed once when no row exists.
 */

import { eq, db, platformIngress } from "@deplow/db"
import type { IngressSettings } from "@deplow/shared"

import { env } from "@/lib/env"

export const PLATFORM_INGRESS_ID = "default"

function settingsFromEnv(): IngressSettings {
  const baseDomain = env.baseDomain
  return {
    baseDomain,
    publicProtocol: env.publicUrlProtocol,
    autoDomainsEnabled: baseDomain.length > 0,
  }
}

function rowToSettings(row: {
  baseDomain: string
  publicProtocol: string
  autoDomainsEnabled: boolean
}): IngressSettings {
  const protocol =
    row.publicProtocol === "http" || row.publicProtocol === "https"
      ? row.publicProtocol
      : "https"
  return {
    baseDomain: (row.baseDomain ?? "").trim(),
    publicProtocol: protocol,
    autoDomainsEnabled: Boolean(row.autoDomainsEnabled),
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
  })
  return seeded
}

export async function saveIngressSettings(
  input: IngressSettings,
): Promise<IngressSettings> {
  const settings: IngressSettings = {
    baseDomain: (input.baseDomain ?? "").trim(),
    publicProtocol: input.publicProtocol,
    autoDomainsEnabled: input.autoDomainsEnabled,
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
      })
      .where(eq(platformIngress.id, PLATFORM_INGRESS_ID))
  } else {
    await db.insert(platformIngress).values({
      id: PLATFORM_INGRESS_ID,
      baseDomain: settings.baseDomain,
      publicProtocol: settings.publicProtocol,
      autoDomainsEnabled: settings.autoDomainsEnabled,
    })
  }

  return settings
}
