export type SentryAuth = {
  publicKey: string
  source: "header" | "query" | "dsn"
}

export function extractSentryKey(input: {
  authHeader: string | null
  queryKey: string | null
  envelopeDsn?: string
}): SentryAuth | null {
  const fromHeader = parseXSentryAuth(input.authHeader)
  if (fromHeader) return { publicKey: fromHeader, source: "header" }

  if (input.queryKey?.trim()) {
    return { publicKey: input.queryKey.trim(), source: "query" }
  }

  if (input.envelopeDsn) {
    const key = publicKeyFromDsn(input.envelopeDsn)
    if (key) return { publicKey: key, source: "dsn" }
  }

  return null
}

export function parseXSentryAuth(header: string | null): string | null {
  if (!header) return null
  // X-Sentry-Auth: Sentry sentry_version=7, sentry_key=KEY, sentry_client=...
  const match = /sentry_key=([a-fA-F0-9]+)/.exec(header)
  return match?.[1] ?? null
}

export function publicKeyFromDsn(dsn: string): string | null {
  try {
    const u = new URL(dsn)
    return u.username || null
  } catch {
    return null
  }
}

export function buildDsn(input: {
  publicKey: string
  host: string
  sentryId: number
  protocol?: string
  pathPrefix?: string
}): string {
  const protocol = input.protocol ?? "https"
  const prefix = input.pathPrefix ?? ""
  return `${protocol}://${input.publicKey}@${input.host}${prefix}/${input.sentryId}`
}
