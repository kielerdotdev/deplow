import type { ProjectEnvSecretEntry } from "@deplow/shared"

export const PROJECT_ENV_SECRET_MASK = "********"

/** Keys injected by the platform; user secrets cannot override these. */
export const RESERVED_PROJECT_ENV_KEYS = new Set([
  "DATABASE_URL",
  "REDIS_URL",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "S3_REGION",
  "HOME",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "ASTRO_TELEMETRY_DISABLED",
  "NEXT_TELEMETRY_DISABLED",
  "SERVICE_NAME",
  "PROJECT_NAME",
  "PORT",
  "HOST",
])

export function parseEnvText(text: string): ProjectEnvSecretEntry[] {
  const entries: ProjectEnvSecretEntry[] = []
  const seen = new Set<string>()

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const eq = line.indexOf("=")
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1)

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ key, value })
  }

  return entries
}

export function formatEnvText(entries: ProjectEnvSecretEntry[]): string {
  return entries.map(({ key, value }) => `${key}=${value}`).join("\n")
}

export function maskProjectEnvEntries(
  entries: ProjectEnvSecretEntry[],
): ProjectEnvSecretEntry[] {
  return entries.map(({ key }) => ({ key, value: PROJECT_ENV_SECRET_MASK }))
}

export function mergeProjectEnvSave(
  existing: Record<string, string>,
  incoming: ProjectEnvSecretEntry[],
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const { key, value } of incoming) {
    if (value === PROJECT_ENV_SECRET_MASK && key in existing) {
      next[key] = existing[key]!
      continue
    }
    next[key] = value
  }
  return next
}

export function assertNoReservedProjectEnvKeys(keys: string[]): void {
  const reserved = keys.filter((key) => RESERVED_PROJECT_ENV_KEYS.has(key))
  if (reserved.length > 0) {
    throw new Error(
      `Reserved keys cannot be set manually: ${reserved.join(", ")}`,
    )
  }
}

export function recordToEntries(
  record: Record<string, string>,
): ProjectEnvSecretEntry[] {
  return Object.entries(record)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

export function entriesToRecord(
  entries: ProjectEnvSecretEntry[],
): Record<string, string> {
  const keys = entries.map((e) => e.key)
  const dupes = keys.filter((key, i) => keys.indexOf(key) !== i)
  if (dupes.length > 0) {
    throw new Error(`Duplicate keys: ${[...new Set(dupes)].join(", ")}`)
  }
  assertNoReservedProjectEnvKeys(keys)
  return Object.fromEntries(entries.map(({ key, value }) => [key, value]))
}
