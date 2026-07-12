/**
 * Central environment configuration — single source of truth for reading
 * process.env. All env parsing, defaults, and production validation live here.
 * Other modules must use this instead of reading process.env directly.
 *
 * Getters read live from process.env on every access so tests that mutate
 * process.env work without needing a reload step.
 */

const INSECURE_SECRETS = new Set([
  "replace-me",
  "dev-only-change-me-deplow-secrets",
  "changeme",
  "secret",
  "password",
  "test",
])

class Env {
  /* ── runtime mode ───────────────────────────────────────────── */

  get isProduction(): boolean {
    return process.env.NODE_ENV === "production"
  }

  get isDev(): boolean {
    return process.env.NODE_ENV === "development"
  }

  get isTest(): boolean {
    return process.env.VITEST === "true"
  }

  get isProdLike(): boolean {
    return this.isProduction && !this.isTest
  }

  /* ── security-critical secrets ─────────────────────────────── */

  /**
   * BETTER_AUTH_SECRET — signs auth sessions and cookies.
   * Must be strong in production; dev falls back to a weak placeholder.
   */
  get betterAuthSecret(): string {
    const value = process.env.BETTER_AUTH_SECRET ?? ""
    if (this.isProdLike) {
      if (!value) {
        throw new Error("BETTER_AUTH_SECRET must be set in production")
      }
      if (value.length < 32 || INSECURE_SECRETS.has(value.toLowerCase())) {
        throw new Error(
          "BETTER_AUTH_SECRET must be a strong random string (>=32 chars) in production",
        )
      }
    }
    return value || "dev-only-insecure-auth-secret-do-not-use-in-prod"
  }

  /**
   * Encryption key for project credentials (DB passwords, Redis passwords,
   * S3 keys, git tokens). Must be strong in production; dev falls back.
   */
  get secretsEncryptionKey(): string {
    const value =
      process.env.DEPLOW_SECRETS_KEY ?? process.env.BETTER_AUTH_SECRET ?? ""
    if (this.isProdLike) {
      if (!value) {
        throw new Error(
          "DEPLOW_SECRETS_KEY (or BETTER_AUTH_SECRET) must be set in production",
        )
      }
      if (value.length < 32 || INSECURE_SECRETS.has(value.toLowerCase())) {
        throw new Error(
          "DEPLOW_SECRETS_KEY must be a strong random string (>=32 chars) in production",
        )
      }
    }
    return value || "dev-only-change-me-deplow-secrets"
  }

  get betterAuthUrl(): string {
    return (
      process.env.BETTER_AUTH_URL ??
      process.env.APP_URL ??
      "http://localhost:3000"
    )
  }

  /* ── platform infrastructure ───────────────────────────────── */

  get databaseUrl(): string {
    return process.env.DATABASE_URL ?? "data/deplow.db"
  }

  get postgresHost(): string {
    return process.env.DEPLOW_POSTGRES_HOST ?? "127.0.0.1"
  }

  get postgresPort(): number {
    return numEnv("DEPLOW_POSTGRES_PORT", 55432)
  }

  get postgresAdminUrl(): string {
    return (
      process.env.DEPLOW_POSTGRES_ADMIN_URL ??
      `postgres://deplow:deplow@${this.postgresHost}:${this.postgresPort}/postgres`
    )
  }

  get postgresDockerHost(): string {
    return process.env.DEPLOW_POSTGRES_DOCKER_HOST ?? "postgres"
  }

  get postgresDockerPort(): number {
    return numEnv("DEPLOW_POSTGRES_DOCKER_PORT", 5432)
  }

  /** Image for per-project dedicated Postgres containers */
  get postgresImage(): string {
    return process.env.DEPLOW_POSTGRES_IMAGE ?? "postgres:16-alpine"
  }

  /** Image for per-project dedicated Redis containers */
  get redisImage(): string {
    return process.env.DEPLOW_REDIS_IMAGE ?? "redis:7-alpine"
  }

  get redisHost(): string {
    return process.env.DEPLOW_REDIS_HOST ?? "127.0.0.1"
  }

  get redisPort(): number {
    return numEnv("DEPLOW_REDIS_PORT", 56379)
  }

  get redisPassword(): string {
    return (
      process.env.DEPLOW_REDIS_PASSWORD ??
      process.env.REDIS_PASSWORD ??
      "deplow"
    )
  }

  get redisUrl(): string {
    return (
      process.env.DEPLOW_REDIS_URL ??
      `redis://:${encodeURIComponent(this.redisPassword)}@${this.redisHost}:${this.redisPort}`
    )
  }

  get redisDockerHost(): string {
    return process.env.DEPLOW_REDIS_DOCKER_HOST ?? "redis"
  }

  get redisDockerPort(): number {
    return numEnv("DEPLOW_REDIS_DOCKER_PORT", 6379)
  }

  /**
   * Platform Redis for BullMQ — distinct from per-project tenant Redis.
   * Defaults to compose-published platform-redis on 56380.
   */
  get queueRedisUrl(): string {
    return (
      process.env.DEPLOW_QUEUE_REDIS_URL ??
      process.env.PLATFORM_REDIS_URL ??
      "redis://127.0.0.1:56380"
    )
  }

  /** When false, deploy/provision run in-process (tests / emergency). */
  get useQueue(): boolean {
    if (this.isTest) return false
    return boolEnv("DEPLOW_USE_QUEUE", true)
  }

  get minioEndpoint(): string {
    return process.env.DEPLOW_MINIO_ENDPOINT ?? "http://127.0.0.1:59000"
  }

  get minioAccessKey(): string {
    return process.env.DEPLOW_MINIO_ACCESS_KEY ?? "deplow"
  }

  get minioSecretKey(): string {
    return process.env.DEPLOW_MINIO_SECRET_KEY ?? "deplowsecret"
  }

  get minioRegion(): string {
    return process.env.DEPLOW_MINIO_REGION ?? "us-east-1"
  }

  get minioPublicEndpoint(): string {
    return process.env.DEPLOW_MINIO_PUBLIC_ENDPOINT ?? "http://127.0.0.1:59000"
  }

  get minioDockerEndpoint(): string {
    return process.env.DEPLOW_MINIO_DOCKER_ENDPOINT ?? "http://minio:9000"
  }

  get backupBucket(): string {
    return process.env.DEPLOW_BACKUP_BUCKET ?? "deplow-backups"
  }

  /* ── Docker / runtime ──────────────────────────────────────── */

  get dockerSocketPath(): string {
    return (
      process.env.DOCKER_HOST?.replace("unix://", "") ?? "/var/run/docker.sock"
    )
  }

  get dockerNetwork(): string {
    return process.env.DEPLOW_DOCKER_NETWORK ?? "deplow_default"
  }

  get appRuntime(): string {
    return process.env.DEPLOW_APP_RUNTIME?.trim() || "runsc"
  }

  get appRuntimeRequired(): boolean {
    return boolEnv("DEPLOW_APP_RUNTIME_REQUIRED", true)
  }

  get appMemoryBytes(): number {
    const mb = numEnv("DEPLOW_APP_MEMORY_MB", 512)
    return (mb > 0 ? mb : 512) * 1024 * 1024
  }

  get appNanoCpus(): number {
    const cpus = numEnv("DEPLOW_APP_CPUS", 1)
    return Math.round((cpus > 0 ? cpus : 1) * 1e9)
  }

  get appReadOnlyRootfs(): boolean {
    return boolEnv("DEPLOW_APP_READONLY_ROOTFS", true)
  }

  /* ── proxy / public URL ─────────────────────────────────────── */

  get baseDomain(): string {
    return (
      (process.env.DEPLOW_BASE_DOMAIN ?? "").trim() ||
      (this.isDev ? "apps.localhost" : "")
    )
  }

  get publicUrlProtocol(): "https" | "http" {
    const p = process.env.DEPLOW_PUBLIC_URL_PROTOCOL?.trim()
    if (p === "http" || p === "https") return p
    const bd = this.baseDomain
    return this.isDev || bd === "localhost" || bd.endsWith(".localhost")
      ? "http"
      : "https"
  }

  get proxyRoutesDir(): string {
    return (
      process.env.DEPLOW_PROXY_ROUTES_DIR ?? pathFromCwd("infra/caddy/routes")
    )
  }

  get cloudflareTunnelToken(): string {
    return (
      process.env.CLOUDFLARE_TUNNEL_TOKEN ??
      process.env.DEPLOW_CLOUDFLARE_TUNNEL_TOKEN ??
      ""
    ).trim()
  }

  /* ── git providers ──────────────────────────────────────────── */

  get gitCloneRoot(): string {
    return process.env.DEPLOW_GIT_CLONE_ROOT ?? pathFromCwd("data/git-clones")
  }

  get publicControlPlaneUrl(): string {
    return (
      process.env.DEPLOW_PUBLIC_URL ??
      process.env.BETTER_AUTH_URL ??
      "http://localhost:3000"
    ).replace(/\/$/, "")
  }

  get githubToken(): string {
    return (process.env.DEPLOW_GITHUB_TOKEN ?? "").trim()
  }

  get gitlabToken(): string {
    return (process.env.DEPLOW_GITLAB_TOKEN ?? "").trim()
  }

  get githubAppId(): string {
    return (process.env.DEPLOW_GITHUB_APP_ID ?? "").trim()
  }

  get githubAppClientId(): string {
    return (process.env.DEPLOW_GITHUB_APP_CLIENT_ID ?? "").trim()
  }

  get githubAppClientSecret(): string {
    return (process.env.DEPLOW_GITHUB_APP_CLIENT_SECRET ?? "").trim()
  }

  get githubAppPrivateKey(): string {
    return (process.env.DEPLOW_GITHUB_APP_PRIVATE_KEY ?? "").trim()
  }

  get githubAppWebhookSecret(): string {
    return (process.env.DEPLOW_GITHUB_APP_WEBHOOK_SECRET ?? "").trim()
  }

  get githubAppSlug(): string {
    return (process.env.DEPLOW_GITHUB_APP_SLUG ?? "").trim()
  }

  get gitlabOAuthClientId(): string {
    return (process.env.DEPLOW_GITLAB_OAUTH_CLIENT_ID ?? "").trim()
  }

  get gitlabOAuthClientSecret(): string {
    return (process.env.DEPLOW_GITLAB_OAUTH_CLIENT_SECRET ?? "").trim()
  }

  get gitlabOAuthBaseUrl(): string {
    return (
      process.env.DEPLOW_GITLAB_OAUTH_BASE_URL ??
      process.env.DEPLOW_GITLAB_URL ??
      "https://gitlab.com"
    )
      .trim()
      .replace(/\/$/, "")
  }
}

export const env = new Env()

/* ── helpers ─────────────────────────────────────────────────── */

function numEnv(name: string, fallback: number): number {
  const v = process.env[name]
  if (v === undefined || v === "") return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function boolEnv(name: string, fallback: boolean): boolean {
  const v = process.env[name]
  if (v === undefined || v === "") return fallback
  return !["0", "false", "no", "off"].includes(v.toLowerCase())
}

function pathFromCwd(relative: string): string {
  const cwd = process.cwd()
  if (cwd.endsWith("apps/web") || cwd.endsWith("apps\\web")) {
    return `${cwd}/../../${relative}`
  }
  return `${cwd}/${relative}`
}
