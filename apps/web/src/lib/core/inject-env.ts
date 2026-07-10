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
  const databaseUrl = `postgres://${encodeURIComponent(credentials.database.user)}:${encodeURIComponent(credentials.database.password)}@${config.postgresDockerHost}:${config.postgresDockerPort}/${credentials.database.database}`

  let redisUrl: string
  if (credentials.redis.url) {
    redisUrl = rewriteUrlHost(
      credentials.redis.url,
      config.redisDockerHost,
      config.redisDockerPort,
    )
  } else if (credentials.redis.password) {
    // ACL username is not known without url; use password-only (default user won't work for ACL namespaces)
    redisUrl = `redis://:${encodeURIComponent(credentials.redis.password)}@${config.redisDockerHost}:${config.redisDockerPort}`
  } else {
    redisUrl = `redis://${config.redisDockerHost}:${config.redisDockerPort}`
  }

  // Prefer ACL form from provisioner: redis://username:password@host:port
  // rewrite only host/port
  if (credentials.redis.url?.includes("://")) {
    try {
      const u = new URL(credentials.redis.url)
      // Redis URLs may use redis://user:pass@host:port — URL parser works
      u.hostname = config.redisDockerHost
      u.port = String(config.redisDockerPort)
      redisUrl = u.href.replace(/\/$/, "")
    } catch {
      // keep fallback
    }
  }

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

function rewriteUrlHost(url: string, host: string, port: number): string {
  try {
    const u = new URL(url)
    u.hostname = host
    u.port = String(port)
    return u.href.replace(/\/$/, "")
  } catch {
    return url
  }
}
