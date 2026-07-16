import type { ProjectCredentials } from "@deplow/shared"

import type { PlatformConfig } from "./platform-config"

/** Env for read-only containers: writable home under /tmp + disable CLI telemetry. */
export function containerRuntimeEnv(
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    HOME: "/tmp",
    XDG_CONFIG_HOME: "/tmp/.config",
    XDG_CACHE_HOME: "/tmp/.cache",
    XDG_DATA_HOME: "/tmp/.local/share",
    // Railpack mise shims otherwise spam / hang on read-only /mise/cache
    MISE_CACHE_DIR: "/tmp/.mise-cache",
    MISE_DATA_DIR: "/tmp/.mise-data",
    MISE_STATE_DIR: "/tmp/.mise-state",
    ASTRO_TELEMETRY_DISABLED: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    ...extra,
  }
}

/**
 * Env vars injected into app containers from full project credentials (legacy).
 * Prefer injectDeployEnvFromBindings for least-privilege.
 */
export function injectDeployEnv(
  credentials: ProjectCredentials,
  config: PlatformConfig,
  extra: Record<string, string> = {},
): Record<string, string> {
  const databaseUrl = buildDatabaseUrl(credentials.database)
  const redisUrl = buildRedisUrl(credentials.redis)

  return {
    ...containerRuntimeEnv(extra),
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    S3_ENDPOINT: config.s3.appEndpoint,
    S3_BUCKET: credentials.storage.bucket,
    S3_ACCESS_KEY: credentials.storage.accessKeyId,
    S3_SECRET_KEY: credentials.storage.secretAccessKey,
    S3_REGION: credentials.storage.region ?? config.s3.region,
  }
}

export type BindingEnvInput = {
  bindings: Array<{
    envKey: string
    url: string
  }>
  storage?: {
    endpoint?: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    region?: string
  } | null
}

/** Build container env from explicit service bindings (+ optional project S3). */
export function injectDeployEnvFromBindings(
  input: BindingEnvInput,
  config: PlatformConfig,
  extra: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = { ...containerRuntimeEnv(extra) }
  for (const b of input.bindings) {
    env[b.envKey] = b.url
  }
  if (input.storage) {
    env.S3_ENDPOINT = config.s3.appEndpoint
    env.S3_BUCKET = input.storage.bucket
    env.S3_ACCESS_KEY = input.storage.accessKeyId
    env.S3_SECRET_KEY = input.storage.secretAccessKey
    env.S3_REGION = input.storage.region ?? config.s3.region
  }
  return env
}

export function buildDatabaseUrl(creds: {
  user: string
  password: string
  database: string
  host: string
  port: number
}): string {
  const { user, password, database, host, port } = creds
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`
}

export function buildRedisUrl(creds: {
  host: string
  port: number
  password?: string
  url?: string
}): string {
  const { host, port, password, url } = creds

  if (url?.includes("://")) {
    return rewriteHost(url, host, port)
  }

  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`
  }

  return `redis://${host}:${port}`
}

function rewriteHost(url: string, host: string, port: number): string {
  try {
    const u = new URL(url)
    u.hostname = host
    u.port = String(port)
    return u.href.replace(/\/$/, "")
  } catch {
    return url
  }
}