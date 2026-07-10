export interface PlatformConfig {
  postgresAdminUrl: string
  /** Host:port for host-side clients / secrets.yaml */
  postgresHost: string
  postgresPort: number
  /** Docker Compose DNS name + internal port for app containers */
  postgresDockerHost: string
  postgresDockerPort: number
  redisUrl: string
  redisHost: string
  redisPort: number
  redisDockerHost: string
  redisDockerPort: number
  redisAdminPassword: string
  minioEndpoint: string
  minioAccessKey: string
  minioSecretKey: string
  minioRegion: string
  minioPublicEndpoint: string
  /** Endpoint reachable from containers on the platform network */
  minioDockerEndpoint: string
  backupBucket: string
  secretsEncryptionKey: string
  dockerSocketPath: string
  /** Compose network name (project_default) for app containers */
  dockerNetwork: string
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/**
 * Load platform connection settings from environment.
 * Safe defaults target the local docker-compose stack.
 */
export function loadPlatformConfig(): PlatformConfig {
  const postgresHost = process.env.DEPLOW_POSTGRES_HOST ?? "127.0.0.1"
  const postgresPort = Number(process.env.DEPLOW_POSTGRES_PORT ?? "55432")
  const redisHost = process.env.DEPLOW_REDIS_HOST ?? "127.0.0.1"
  const redisPort = Number(process.env.DEPLOW_REDIS_PORT ?? "56379")
  const redisAdminPassword =
    process.env.DEPLOW_REDIS_PASSWORD ?? process.env.REDIS_PASSWORD ?? "deplow"

  return {
    postgresAdminUrl:
      process.env.DEPLOW_POSTGRES_ADMIN_URL ??
      `postgres://deplow:deplow@${postgresHost}:${postgresPort}/postgres`,
    postgresHost,
    postgresPort,
    postgresDockerHost: process.env.DEPLOW_POSTGRES_DOCKER_HOST ?? "postgres",
    postgresDockerPort: Number(
      process.env.DEPLOW_POSTGRES_DOCKER_PORT ?? "5432",
    ),
    redisUrl:
      process.env.DEPLOW_REDIS_URL ??
      `redis://:${encodeURIComponent(redisAdminPassword)}@${redisHost}:${redisPort}`,
    redisHost,
    redisPort,
    redisDockerHost: process.env.DEPLOW_REDIS_DOCKER_HOST ?? "redis",
    redisDockerPort: Number(process.env.DEPLOW_REDIS_DOCKER_PORT ?? "6379"),
    redisAdminPassword,
    minioEndpoint:
      process.env.DEPLOW_MINIO_ENDPOINT ?? "http://127.0.0.1:59000",
    minioAccessKey: process.env.DEPLOW_MINIO_ACCESS_KEY ?? "deplow",
    minioSecretKey: process.env.DEPLOW_MINIO_SECRET_KEY ?? "deplowsecret",
    minioRegion: process.env.DEPLOW_MINIO_REGION ?? "us-east-1",
    minioPublicEndpoint:
      process.env.DEPLOW_MINIO_PUBLIC_ENDPOINT ?? "http://127.0.0.1:59000",
    minioDockerEndpoint:
      process.env.DEPLOW_MINIO_DOCKER_ENDPOINT ?? "http://minio:9000",
    backupBucket: process.env.DEPLOW_BACKUP_BUCKET ?? "deplow-backups",
    secretsEncryptionKey: requireEnv(
      "DEPLOW_SECRETS_KEY",
      process.env.BETTER_AUTH_SECRET ?? "dev-only-change-me-deplow-secrets",
    ),
    dockerSocketPath:
      process.env.DOCKER_HOST?.replace("unix://", "") ?? "/var/run/docker.sock",
    dockerNetwork: process.env.DEPLOW_DOCKER_NETWORK ?? "deplow_default",
  }
}
