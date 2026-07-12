/**
 * App-managed operator HTTPS notify webhook (GTM thin carve-out).
 * Fired on deploy/provision failure (and optionally success).
 */

import { eq, db, platformOperatorWebhook } from "@deplow/db"
import type { OperatorWebhookSettings } from "@deplow/shared"

import { decryptString, encryptString } from "@/lib/core/crypto"
import { loadPlatformConfig } from "@/lib/core/platform-config"

function encryptionKey(): string {
  return loadPlatformConfig().secretsEncryptionKey
}

export const PLATFORM_OPERATOR_WEBHOOK_ID = "default"

export type OperatorWebhookSettingsPublic = OperatorWebhookSettings & {
  /** True when a signing secret is stored (value never returned). */
  hasSecret: boolean
}

function rowToPublic(row: {
  enabled: boolean
  url: string
  secretEncrypted: string | null
  onFailure: boolean
  onSuccess: boolean
}): OperatorWebhookSettingsPublic {
  return {
    enabled: Boolean(row.enabled),
    url: (row.url ?? "").trim(),
    onFailure: Boolean(row.onFailure),
    onSuccess: Boolean(row.onSuccess),
    hasSecret: Boolean(row.secretEncrypted),
  }
}

export async function loadOperatorWebhookSettings(): Promise<OperatorWebhookSettingsPublic> {
  const [row] = await db
    .select()
    .from(platformOperatorWebhook)
    .where(eq(platformOperatorWebhook.id, PLATFORM_OPERATOR_WEBHOOK_ID))

  if (!row) {
    return {
      enabled: false,
      url: "",
      onFailure: true,
      onSuccess: false,
      hasSecret: false,
    }
  }
  return rowToPublic(row)
}

export async function saveOperatorWebhookSettings(input: {
  enabled: boolean
  url: string
  onFailure: boolean
  onSuccess: boolean
  /** Pass null to clear; undefined to leave unchanged; string to set. */
  secret?: string | null
}): Promise<OperatorWebhookSettingsPublic> {
  const url = input.url.trim()
  const [existing] = await db
    .select()
    .from(platformOperatorWebhook)
    .where(eq(platformOperatorWebhook.id, PLATFORM_OPERATOR_WEBHOOK_ID))

  let secretEncrypted = existing?.secretEncrypted ?? null
  if (input.secret === null) {
    secretEncrypted = null
  } else if (typeof input.secret === "string" && input.secret.length > 0) {
    secretEncrypted = encryptString(input.secret, encryptionKey())
  }

  const values = {
    id: PLATFORM_OPERATOR_WEBHOOK_ID,
    enabled: input.enabled,
    url,
    secretEncrypted,
    onFailure: input.onFailure,
    onSuccess: input.onSuccess,
    updatedAt: new Date(),
  }

  if (existing) {
    await db
      .update(platformOperatorWebhook)
      .set(values)
      .where(eq(platformOperatorWebhook.id, PLATFORM_OPERATOR_WEBHOOK_ID))
  } else {
    await db.insert(platformOperatorWebhook).values(values)
  }

  return loadOperatorWebhookSettings()
}

export async function getOperatorWebhookSecretPlain(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(platformOperatorWebhook)
    .where(eq(platformOperatorWebhook.id, PLATFORM_OPERATOR_WEBHOOK_ID))
  if (!row?.secretEncrypted) return null
  return decryptString(row.secretEncrypted, encryptionKey())
}
