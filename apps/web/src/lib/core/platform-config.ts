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
  /**
   * OCI runtime for user app containers (default runsc / gVisor).
   * Platform services and builds stay on runc.
   */
  appRuntime: string
  /** If true, deploy fails when appRuntime is missing from the daemon */
  appRuntimeRequired: boolean
  appMemoryBytes: number
  appNanoCpus: number
  /** Default true — user apps get a read-only rootfs + /tmp tmpfs */
  appReadOnlyRootfs: boolean
  /**
   * Platform base domain for public URLs, e.g. apps.example.com.
   * Empty → public URL features disabled until configured.
   */
  baseDomain: string
  /** Directory for Caddy route snippets */
  proxyRoutesDir: string
  /** http for local dev without TLS; https for cloudflared edge */
  publicUrlProtocol: "https" | "http"
  /** Cloudflare tunnel token (operator-configured; optional) */
  cloudflareTunnelToken: string
  /** Absolute path for git clones used by webhook deploys */
  gitCloneRoot: string
  /** Public base URL of this control plane (webhook callback URLs) */
  publicControlPlaneUrl: string
  /** Optional platform-level GitHub PAT for repo listing (operator) */
  githubToken: string
  /** Optional platform-level GitLab PAT for repo listing (operator) */
  gitlabToken: string
}

const DEV_SECRETS_FALLBACK = "dev-only-change-me-deplow-secrets"

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function envBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name]
  if (v === undefined || v === "") return defaultValue
  return !["0", "false", "no", "off"].includes(v.toLowerCase())
}

/**
 * Production (or DEPLOW_REQUIRE_SECRETS=true) must set real secrets —
 * never the dev-only fallback.
 */
export function assertProductionSecrets(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const requireSecrets =
    env.NODE_ENV === "production" ||
    env.DEPLOW_REQUIRE_SECRETS === "1" ||
    env.DEPLOW_REQUIRE_SECRETS === "true"

  if (!requireSecrets) return

  const auth = (env.BETTER_AUTH_SECRET ?? "").trim()
  const secrets = (env.DEPLOW_SECRETS_KEY ?? "").trim()
  const effective = secrets || auth

  if (!effective) {
    throw new Error(
      "Missing required secrets for production: set BETTER_AUTH_SECRET and DEPLOW_SECRETS_KEY",
    )
  }
  if (
    effective === DEV_SECRETS_FALLBACK ||
    auth === DEV_SECRETS_FALLBACK ||
    secrets === DEV_SECRETS_FALLBACK
  ) {
    throw new Error(
      "Refusing to start with the dev-only secrets fallback. Set BETTER_AUTH_SECRET and DEPLOW_SECRETS_KEY to strong values.",
    )
  }
  if (effective.length < 16) {
    throw new Error("Secrets keys must be at least 16 characters in production")
  }
}

/**
 * Load platform connection settings from environment.
 * Safe defaults target the local docker-compose stack.
 */
export function loadPlatformConfig(): PlatformConfig {
  assertProductionSecrets()

  const postgresHost = process.env.DEPLOW_POSTGRES_HOST ?? "127.0.0.1"
  const postgresPort = Number(process.env.DEPLOW_POSTGRES_PORT ?? "55432")
  const redisHost = process.env.DEPLOW_REDIS_HOST ?? "127.0.0.1"
  const redisPort = Number(process.env.DEPLOW_REDIS_PORT ?? "56379")
  const redisAdminPassword =
    process.env.DEPLOW_REDIS_PASSWORD ?? process.env.REDIS_PASSWORD ?? "deplow"

  const memoryMb = Number(process.env.DEPLOW_APP_MEMORY_MB ?? "512")
  const cpus = Number(process.env.DEPLOW_APP_CPUS ?? "1")
  const isDev = process.env.NODE_ENV === "development"
  // Local default so URL features work out of the box in `vite dev`
  const baseDomain =
    (process.env.DEPLOW_BASE_DOMAIN ?? "").trim() ||
    (isDev ? "apps.localhost" : "")
  const protocolEnv = process.env.DEPLOW_PUBLIC_URL_PROTOCOL?.trim()
  const publicProtocol: "https" | "http" =
    protocolEnv === "http" || protocolEnv === "https"
      ? protocolEnv
      : isDev || baseDomain === "localhost" || baseDomain.endsWith(".localhost")
        ? "http"
        : "https"

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
      process.env.BETTER_AUTH_SECRET ?? DEV_SECRETS_FALLBACK,
    ),
    dockerSocketPath:
      process.env.DOCKER_HOST?.replace("unix://", "") ?? "/var/run/docker.sock",
    dockerNetwork: process.env.DEPLOW_DOCKER_NETWORK ?? "deplow_default",
    appRuntime: process.env.DEPLOW_APP_RUNTIME?.trim() || "runsc",
    appRuntimeRequired: envBool("DEPLOW_APP_RUNTIME_REQUIRED", true),
    appMemoryBytes: (memoryMb > 0 ? memoryMb : 512) * 1024 * 1024,
    appNanoCpus: Math.round((cpus > 0 ? cpus : 1) * 1e9),
    appReadOnlyRootfs: envBool("DEPLOW_APP_READONLY_ROOTFS", true),
    baseDomain,
    proxyRoutesDir:
      process.env.DEPLOW_PROXY_ROUTES_DIR ?? pathFromCwd("infra/caddy/routes"),
    publicUrlProtocol: publicProtocol,
    cloudflareTunnelToken: (
      process.env.CLOUDFLARE_TUNNEL_TOKEN ??
      process.env.DEPLOW_CLOUDFLARE_TUNNEL_TOKEN ??
      ""
    ).trim(),
    githubToken: (process.env.DEPLOW_GITHUB_TOKEN ?? "").trim(),
    gitlabToken: (process.env.DEPLOW_GITLAB_TOKEN ?? "").trim(),
    gitCloneRoot:
      process.env.DEPLOW_GIT_CLONE_ROOT ?? pathFromCwd("data/git-clones"),
    publicControlPlaneUrl: (
      process.env.DEPLOW_PUBLIC_URL ??
      process.env.BETTER_AUTH_URL ??
      "http://localhost:3000"
    ).replace(/\/$/, ""),
  }
}

function pathFromCwd(relative: string): string {
  // Prefer monorepo root when running from apps/web
  const candidates = [
    `${process.cwd()}/${relative}`,
    `${process.cwd()}/../../${relative}`,
  ]
  // Return the monorepo-root-ish path without requiring fs (config is pure-ish)
  if (
    process.cwd().endsWith("apps/web") ||
    process.cwd().endsWith("apps\\web")
  ) {
    return `${process.cwd()}/../../${relative}`
  }
  return candidates[0]!
}
