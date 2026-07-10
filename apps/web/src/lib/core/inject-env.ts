import type { ProjectCredentials } from "@deplow/shared"

import type { PlatformConfig } from "./platform-config"

/**
 * Env vars injected into app containers.
 * Uses Docker Compose DNS names + internal ports so containers on
 * `deplow_default` can reach Postgres/Redis/MinIO (not 127.0.0.1 host ports).
 * secrets.yaml keeps host-facing URLs for tools running on the host.
 */
export function injectDeployEnv(
  credentials: ProjectCredentials,
  config: PlatformConfig,
  extra: Record<string, string> = {},
): Record<string, string> {
  const databaseUrl = buildDatabaseUrl(credentials, config)
  const redisUrl = buildRedisUrl(credentials, config)

  return {
    ...extra,
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    S3_ENDPOINT: config.minioDockerEndpoint,
    S3_BUCKET: credentials.storage.bucket,
    S3_ACCESS_KEY: credentials.storage.accessKeyId,
    S3_SECRET_KEY: credentials.storage.secretAccessKey,
    S3_REGION: credentials.storage.region ?? config.minioRegion,
  }
}

function buildDatabaseUrl(
  creds: ProjectCredentials,
  config: PlatformConfig,
): string {
  const { user, password, database } = creds.database
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${config.postgresDockerHost}:${config.postgresDockerPort}/${database}`
}

function buildRedisUrl(
  creds: ProjectCredentials,
  config: PlatformConfig,
): string {
  const dockerHost = config.redisDockerHost
  const dockerPort = config.redisDockerPort

  // Prefer ACL form from provisioner: redis://username:password@host:port
  if (creds.redis.url?.includes("://")) {
    return rewriteHost(creds.redis.url, dockerHost, dockerPort)
  }

  // Password-only (no ACL username known without url)
  if (creds.redis.password) {
    return `redis://:${encodeURIComponent(creds.redis.password)}@${dockerHost}:${dockerPort}`
  }

  // No auth (development / single-tenant)
  return `redis://${dockerHost}:${dockerPort}`
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