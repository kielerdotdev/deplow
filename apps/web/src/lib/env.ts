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
      "http://localhost:9565"
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
    return (
      process.env.DEPLOW_S3_ENDPOINT ??
      process.env.DEPLOW_MINIO_ENDPOINT ??
      "http://127.0.0.1:59000"
    )
  }

  get minioAccessKey(): string {
    return (
      process.env.DEPLOW_S3_ACCESS_KEY ??
      process.env.DEPLOW_MINIO_ACCESS_KEY ??
      "deplow"
    )
  }

  get minioSecretKey(): string {
    return (
      process.env.DEPLOW_S3_SECRET_KEY ??
      process.env.DEPLOW_MINIO_SECRET_KEY ??
      "deplowsecret"
    )
  }

  get minioRegion(): string {
    return (
      process.env.DEPLOW_S3_REGION ??
      process.env.DEPLOW_MINIO_REGION ??
      (this.s3Provider === "r2" ? "auto" : "us-east-1")
    )
  }

  get minioPublicEndpoint(): string {
    return (
      process.env.DEPLOW_S3_PUBLIC_ENDPOINT ??
      process.env.DEPLOW_MINIO_PUBLIC_ENDPOINT ??
      this.minioEndpoint
    )
  }

  get minioDockerEndpoint(): string {
    return (
      process.env.DEPLOW_S3_APP_ENDPOINT ??
      process.env.DEPLOW_MINIO_DOCKER_ENDPOINT ??
      this.minioEndpoint
    )
  }

  /** S3 backend: `minio` (self-hosted / any path-style) or `r2` (Cloudflare). */
  get s3Provider(): "minio" | "r2" {
    const raw = (
      process.env.DEPLOW_S3_PROVIDER ??
      process.env.DEPLOW_OBJECT_STORAGE_PROVIDER ??
      "minio"
    )
      .trim()
      .toLowerCase()
    if (raw === "r2" || raw === "cloudflare-r2") return "r2"
    return "minio"
  }

  /** Cloudflare account id — used to derive R2 endpoint when DEPLOW_S3_ENDPOINT is unset. */
  get r2AccountId(): string {
    return process.env.DEPLOW_R2_ACCOUNT_ID?.trim() ?? ""
  }

  /**
   * MinIO only: provision per-project IAM users via `mc admin`.
   * Default off — prefer shared keys + on-demand buckets (works for external MinIO + R2).
   */
  get s3ScopedUsers(): boolean {
    return boolEnv("DEPLOW_S3_SCOPED_USERS", false)
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
      "http://localhost:9565"
    ).replace(/\/$/, "")
  }

  /* ── Hetzner Cloud (optional agent VM spawn) ───────────────── */

  get hetznerApiToken(): string {
    return (process.env.DEPLOW_HETZNER_API_TOKEN ?? "").trim()
  }

  get hetznerLocation(): string {
    return (process.env.DEPLOW_HETZNER_LOCATION ?? "fsn1").trim() || "fsn1"
  }

  get hetznerServerType(): string {
    return (process.env.DEPLOW_HETZNER_SERVER_TYPE ?? "cpx22").trim() || "cpx22"
  }

  get hetznerImage(): string {
    return (
      (process.env.DEPLOW_HETZNER_IMAGE ?? "ubuntu-24.04").trim() ||
      "ubuntu-24.04"
    )
  }

  /** Comma-separated SSH key names or ids registered in the Hetzner project. */
  get hetznerSshKeys(): string[] | undefined {
    const raw = (process.env.DEPLOW_HETZNER_SSH_KEYS ?? "").trim()
    if (!raw) return undefined
    const keys = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    return keys.length > 0 ? keys : undefined
  }

  get githubToken(): string {
    return (process.env.DEPLOW_GITHUB_TOKEN ?? "").trim()
  }

  get gitlabToken(): string {
    return (process.env.DEPLOW_GITLAB_TOKEN ?? "").trim()
  }

  /* ── Build registry (git → image → k3s) ─────────────────────── */

  /**
   * OCI registry prefix for built images, e.g. `ghcr.io/myorg/hostrig` or
   * `registry.example.com/hostrig`. Required for git-based deploys without a
   * prebuilt image. Images are tagged as `{registry}/{project}-{service}:{id}`.
   */
  get buildRegistry(): string {
    return (process.env.DEPLOW_BUILD_REGISTRY ?? "").trim().replace(/\/+$/, "")
  }

  /** Registry username for docker login / image pull secret (optional if public). */
  get buildRegistryUsername(): string {
    return (
      process.env.DEPLOW_BUILD_REGISTRY_USERNAME ??
      process.env.DEPLOW_BUILD_REGISTRY_USER ??
      ""
    ).trim()
  }

  /** Registry password or token for push + pull. */
  get buildRegistryPassword(): string {
    return (
      process.env.DEPLOW_BUILD_REGISTRY_PASSWORD ??
      process.env.DEPLOW_BUILD_REGISTRY_TOKEN ??
      ""
    ).trim()
  }

  /**
   * Hostname for docker login (defaults to first path segment of registry).
   * e.g. registry `ghcr.io/myorg/hostrig` → server `ghcr.io`.
   */
  get buildRegistryServer(): string {
    const explicit = (
      process.env.DEPLOW_BUILD_REGISTRY_SERVER ?? ""
    ).trim()
    if (explicit) return explicit
    const reg = this.buildRegistry
    if (!reg) return ""
    // Strip scheme if present
    const bare = reg.replace(/^https?:\/\//, "")
    return bare.split("/")[0] ?? bare
  }

  get dockerBin(): string {
    return (process.env.DOCKER_BIN ?? "docker").trim() || "docker"
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

  /* ── Observe (optional; requires ClickHouse when enabled) ───── */

  get observeEnabled(): boolean {
    return boolEnv("DEPLOW_OBSERVE_ENABLED", false)
  }

  get clickhouseUrl(): string {
    return (
      process.env.DEPLOW_CLICKHOUSE_URL ?? "http://127.0.0.1:8123"
    ).trim()
  }

  get clickhouseDatabase(): string {
    return (process.env.DEPLOW_CLICKHOUSE_DATABASE ?? "deplow_observe").trim()
  }

  get clickhouseUser(): string {
    return (process.env.DEPLOW_CLICKHOUSE_USER ?? "deplow").trim()
  }

  get clickhousePassword(): string {
    return process.env.DEPLOW_CLICKHOUSE_PASSWORD ?? "deplow"
  }

  get observeIngestUrl(): string {
    const explicit = (process.env.DEPLOW_OBSERVE_INGEST_URL ?? "").trim()
    if (explicit) return explicit.replace(/\/$/, "")
    return this.betterAuthUrl.replace(/\/$/, "")
  }

  get observeStagingDir(): string {
    return (
      process.env.DEPLOW_OBSERVE_STAGING_DIR ??
      pathFromCwd("data/observe/ingest")
    )
  }

  get observeDefaultMaxEvents(): number {
    return numEnv("DEPLOW_OBSERVE_DEFAULT_MAX_EVENTS", 10_000)
  }

  get observeDefaultRetentionDays(): number {
    return numEnv("DEPLOW_OBSERVE_DEFAULT_RETENTION_DAYS", 30)
  }

  /**
   * Dogfood: send this app's own Sentry SDK traffic into Observe.
   * Defaults ON in development when Observe is enabled.
   * Set DEPLOW_OBSERVE_DOGFOOD=0 to disable. Production needs
   * DEPLOW_OBSERVE_DOGFOOD_FORCE=1.
   */
  get observeDogfood(): boolean {
    if (!this.observeEnabled) return false
    const raw = process.env.DEPLOW_OBSERVE_DOGFOOD
    if (raw !== undefined && raw !== "") {
      return !["0", "false", "no", "off"].includes(raw.toLowerCase())
    }
    if (this.isDev) return true
    return boolEnv("DEPLOW_OBSERVE_DOGFOOD_FORCE", false)
  }

  /** Explicit DSN (http://key@host/sentryId). Also accepted as VITE_… for the browser. */
  get observeDogfoodDsn(): string {
    return (
      process.env.DEPLOW_OBSERVE_DOGFOOD_DSN ??
      process.env.VITE_DEPLOW_OBSERVE_DOGFOOD_DSN ??
      ""
    ).trim()
  }

  /** Optional Deploy project UUID to auto-build a dogfood DSN from. */
  get observeDogfoodProjectId(): string {
    return (process.env.DEPLOW_OBSERVE_DOGFOOD_PROJECT_ID ?? "").trim()
  }

  get otelcolUrl(): string {
    return (
      process.env.DEPLOW_OTELCOL_URL ?? "http://127.0.0.1:4318"
    ).trim()
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
