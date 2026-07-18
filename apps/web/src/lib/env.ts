/**
 * Central environment configuration — single source of truth for reading
 * process.env. All env parsing, defaults, and production validation live here.
 * Other modules must use this instead of reading process.env directly.
 *
 * Getters read live from process.env on every access so tests that mutate
 * process.env work without needing a reload step.
 */

/**
 * Accept legacy DEPLOW_* / VITE_DEPLOW_* env vars during the rebrand.
 * HOSTRIG_* always wins when both are set.
 */
function applyLegacyEnvAliases(): void {
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (key.startsWith("DEPLOW_")) {
      const next = `HOSTRIG_${key.slice("DEPLOW_".length)}`
      if (process.env[next] === undefined || process.env[next] === "") {
        process.env[next] = value
      }
      continue
    }
    if (key.startsWith("VITE_DEPLOW_")) {
      const next = `VITE_HOSTRIG_${key.slice("VITE_DEPLOW_".length)}`
      if (process.env[next] === undefined || process.env[next] === "") {
        process.env[next] = value
      }
    }
  }
}
applyLegacyEnvAliases()

const INSECURE_SECRETS = new Set([
  "replace-me",
  "dev-only-change-me-hostrig-secrets",
  "dev-only-change-me-deplow-secrets",
  "changeme",
  "secret",
  "password",
  "test",
  "deplowsecret",
  "hostrigsecret",
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
   * S3 keys, git tokens, kubeconfig). Must be strong and distinct from the
   * session secret in production.
   */
  get secretsEncryptionKey(): string {
    const dedicated = process.env.HOSTRIG_SECRETS_KEY ?? ""
    const authSecret = process.env.BETTER_AUTH_SECRET ?? ""
    if (this.isProdLike) {
      if (!dedicated) {
        throw new Error(
          "HOSTRIG_SECRETS_KEY must be set in production (do not rely on BETTER_AUTH_SECRET alone)",
        )
      }
      if (dedicated.length < 32 || INSECURE_SECRETS.has(dedicated.toLowerCase())) {
        throw new Error(
          "HOSTRIG_SECRETS_KEY must be a strong random string (>=32 chars) in production",
        )
      }
      if (authSecret && dedicated === authSecret) {
        throw new Error(
          "HOSTRIG_SECRETS_KEY must be distinct from BETTER_AUTH_SECRET so session and at-rest crypto do not share a key",
        )
      }
      return dedicated
    }
    // Dev: allow fallback chain for convenience
    return (
      dedicated ||
      authSecret ||
      "dev-only-change-me-hostrig-secrets"
    )
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
    return process.env.DATABASE_URL ?? "data/hostrig.db"
  }

  get postgresHost(): string {
    return process.env.HOSTRIG_POSTGRES_HOST ?? "127.0.0.1"
  }

  get postgresPort(): number {
    return numEnv("HOSTRIG_POSTGRES_PORT", 55432)
  }

  get postgresAdminUrl(): string {
    return (
      process.env.HOSTRIG_POSTGRES_ADMIN_URL ??
      `postgres://hostrig:hostrig@${this.postgresHost}:${this.postgresPort}/postgres`
    )
  }

  get postgresDockerHost(): string {
    return process.env.HOSTRIG_POSTGRES_DOCKER_HOST ?? "postgres"
  }

  get postgresDockerPort(): number {
    return numEnv("HOSTRIG_POSTGRES_DOCKER_PORT", 5432)
  }

  /** Image for per-project dedicated Postgres containers */
  get postgresImage(): string {
    return process.env.HOSTRIG_POSTGRES_IMAGE ?? "postgres:16-alpine"
  }

  /** Image for per-project dedicated Redis containers */
  get redisImage(): string {
    return process.env.HOSTRIG_REDIS_IMAGE ?? "redis:7-alpine"
  }

  get redisHost(): string {
    return process.env.HOSTRIG_REDIS_HOST ?? "127.0.0.1"
  }

  get redisPort(): number {
    return numEnv("HOSTRIG_REDIS_PORT", 56379)
  }

  get redisPassword(): string {
    return (
      process.env.HOSTRIG_REDIS_PASSWORD ??
      process.env.REDIS_PASSWORD ??
      "hostrig"
    )
  }

  get redisUrl(): string {
    return (
      process.env.HOSTRIG_REDIS_URL ??
      `redis://:${encodeURIComponent(this.redisPassword)}@${this.redisHost}:${this.redisPort}`
    )
  }

  get redisDockerHost(): string {
    return process.env.HOSTRIG_REDIS_DOCKER_HOST ?? "redis"
  }

  get redisDockerPort(): number {
    return numEnv("HOSTRIG_REDIS_DOCKER_PORT", 6379)
  }

  /**
   * Platform Redis for BullMQ — distinct from per-project tenant Redis.
   * Defaults to compose-published platform-redis on 56380.
   */
  get queueRedisUrl(): string {
    if (process.env.HOSTRIG_QUEUE_REDIS_URL) {
      return process.env.HOSTRIG_QUEUE_REDIS_URL
    }
    if (process.env.PLATFORM_REDIS_URL) {
      return process.env.PLATFORM_REDIS_URL
    }
    // Prefer authenticated URL when HOSTRIG_REDIS_PASSWORD is set (platform Redis).
    const pw =
      process.env.HOSTRIG_REDIS_PASSWORD ?? process.env.REDIS_PASSWORD ?? ""
    if (pw) {
      return `redis://:${encodeURIComponent(pw)}@127.0.0.1:56380`
    }
    return "redis://127.0.0.1:56380"
  }

  /** When false, deploy/provision run in-process (tests / emergency). */
  get useQueue(): boolean {
    if (this.isTest) return false
    return boolEnv("HOSTRIG_USE_QUEUE", true)
  }

  get minioEndpoint(): string {
    return (
      process.env.HOSTRIG_S3_ENDPOINT ??
      process.env.HOSTRIG_MINIO_ENDPOINT ??
      "http://127.0.0.1:59000"
    )
  }

  get minioAccessKey(): string {
    return (
      process.env.HOSTRIG_S3_ACCESS_KEY ??
      process.env.HOSTRIG_MINIO_ACCESS_KEY ??
      "hostrig"
    )
  }

  get minioSecretKey(): string {
    return (
      process.env.HOSTRIG_S3_SECRET_KEY ??
      process.env.HOSTRIG_MINIO_SECRET_KEY ??
      "hostrigsecret"
    )
  }

  get minioRegion(): string {
    return (
      process.env.HOSTRIG_S3_REGION ??
      process.env.HOSTRIG_MINIO_REGION ??
      (this.s3Provider === "r2" ? "auto" : "us-east-1")
    )
  }

  get minioPublicEndpoint(): string {
    return (
      process.env.HOSTRIG_S3_PUBLIC_ENDPOINT ??
      process.env.HOSTRIG_MINIO_PUBLIC_ENDPOINT ??
      this.minioEndpoint
    )
  }

  get minioDockerEndpoint(): string {
    return (
      process.env.HOSTRIG_S3_APP_ENDPOINT ??
      process.env.HOSTRIG_MINIO_DOCKER_ENDPOINT ??
      this.minioEndpoint
    )
  }

  /** S3 backend: `minio` (self-hosted / any path-style) or `r2` (Cloudflare). */
  get s3Provider(): "minio" | "r2" {
    const raw = (
      process.env.HOSTRIG_S3_PROVIDER ??
      process.env.HOSTRIG_OBJECT_STORAGE_PROVIDER ??
      "minio"
    )
      .trim()
      .toLowerCase()
    if (raw === "r2" || raw === "cloudflare-r2") return "r2"
    return "minio"
  }

  /** Cloudflare account id — used to derive R2 endpoint when HOSTRIG_S3_ENDPOINT is unset. */
  get r2AccountId(): string {
    return process.env.HOSTRIG_R2_ACCOUNT_ID?.trim() ?? ""
  }

  /**
   * MinIO only: provision per-project IAM users via `mc admin`.
   * Default off — prefer shared keys + on-demand buckets (works for external MinIO + R2).
   */
  get s3ScopedUsers(): boolean {
    return boolEnv("HOSTRIG_S3_SCOPED_USERS", false)
  }

  get backupBucket(): string {
    return process.env.HOSTRIG_BACKUP_BUCKET ?? "hostrig-backups"
  }

  /* ── Docker / runtime ──────────────────────────────────────── */

  get dockerSocketPath(): string {
    return (
      process.env.DOCKER_HOST?.replace("unix://", "") ?? "/var/run/docker.sock"
    )
  }

  get dockerNetwork(): string {
    return process.env.HOSTRIG_DOCKER_NETWORK ?? "hostrig_default"
  }

  /**
   * User app sandbox runtime. Always gVisor (runsc).
   * HOSTRIG_APP_RUNTIME=runc is rejected — there is no unsandboxed escape hatch.
   */
  get appRuntime(): string {
    const raw = (process.env.HOSTRIG_APP_RUNTIME ?? "").trim().toLowerCase()
    if (raw === "runc" || raw === "default") {
      if (this.isProdLike) {
        throw new Error(
          "HOSTRIG_APP_RUNTIME=runc is not allowed. User apps must use gVisor (runsc). " +
            "Install runsc on every k3s node (docs/secure-runtime.md) and set HOSTRIG_APP_RUNTIME=runsc or omit it.",
        )
      }
      console.warn(
        "[hostrig] HOSTRIG_APP_RUNTIME=runc is disabled — forcing runsc (gVisor)",
      )
    }
    return "runsc"
  }

  /** Always true — user apps never deploy without gVisor RuntimeClass. */
  get appRuntimeRequired(): boolean {
    return true
  }

  get appMemoryBytes(): number {
    const mb = numEnv("HOSTRIG_APP_MEMORY_MB", 512)
    return (mb > 0 ? mb : 512) * 1024 * 1024
  }

  get appNanoCpus(): number {
    // Default 0.25 CPU so multi-tenant small nodes can schedule rollouts
    const cpus = numEnv("HOSTRIG_APP_CPUS", 0.25)
    return Math.round((cpus > 0 ? cpus : 0.25) * 1e9)
  }

  get appReadOnlyRootfs(): boolean {
    return boolEnv("HOSTRIG_APP_READONLY_ROOTFS", true)
  }

  /* ── proxy / public URL ─────────────────────────────────────── */

  get baseDomain(): string {
    return (
      (process.env.HOSTRIG_BASE_DOMAIN ?? "").trim() ||
      (this.isDev ? "apps.localhost" : "")
    )
  }

  get publicUrlProtocol(): "https" | "http" {
    const p = process.env.HOSTRIG_PUBLIC_URL_PROTOCOL?.trim()
    if (p === "http" || p === "https") return p
    const bd = this.baseDomain
    return this.isDev || bd === "localhost" || bd.endsWith(".localhost")
      ? "http"
      : "https"
  }

  get proxyRoutesDir(): string {
    return (
      process.env.HOSTRIG_PROXY_ROUTES_DIR ?? pathFromCwd("infra/caddy/routes")
    )
  }

  get cloudflareTunnelToken(): string {
    return (
      process.env.CLOUDFLARE_TUNNEL_TOKEN ??
      process.env.HOSTRIG_CLOUDFLARE_TUNNEL_TOKEN ??
      ""
    ).trim()
  }

  /* ── git providers ──────────────────────────────────────────── */

  get gitCloneRoot(): string {
    return process.env.HOSTRIG_GIT_CLONE_ROOT ?? pathFromCwd("data/git-clones")
  }

  get publicControlPlaneUrl(): string {
    return (
      process.env.HOSTRIG_PUBLIC_URL ??
      process.env.BETTER_AUTH_URL ??
      "http://localhost:9565"
    ).replace(/\/$/, "")
  }

  /* ── Hetzner Cloud (optional agent VM spawn) ───────────────── */

  get hetznerApiToken(): string {
    return (process.env.HOSTRIG_HETZNER_API_TOKEN ?? "").trim()
  }

  get hetznerLocation(): string {
    return (process.env.HOSTRIG_HETZNER_LOCATION ?? "fsn1").trim() || "fsn1"
  }

  get hetznerServerType(): string {
    return (process.env.HOSTRIG_HETZNER_SERVER_TYPE ?? "cpx22").trim() || "cpx22"
  }

  get hetznerImage(): string {
    return (
      (process.env.HOSTRIG_HETZNER_IMAGE ?? "ubuntu-24.04").trim() ||
      "ubuntu-24.04"
    )
  }

  /** Comma-separated SSH key names or ids registered in the Hetzner project. */
  get hetznerSshKeys(): string[] | undefined {
    const raw = (process.env.HOSTRIG_HETZNER_SSH_KEYS ?? "").trim()
    if (!raw) return undefined
    const keys = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    return keys.length > 0 ? keys : undefined
  }

  get githubToken(): string {
    return (process.env.HOSTRIG_GITHUB_TOKEN ?? "").trim()
  }

  get gitlabToken(): string {
    return (process.env.HOSTRIG_GITLAB_TOKEN ?? "").trim()
  }

  /* ── Build registry (git → image → k3s) ─────────────────────── */

  /**
   * OCI registry prefix for built images, e.g. `ghcr.io/myorg/hostrig` or
   * `registry.example.com/hostrig`. Required for git-based deploys without a
   * prebuilt image. Images are tagged as `{registry}/{project}-{service}:{id}`.
   */
  get buildRegistry(): string {
    return (process.env.HOSTRIG_BUILD_REGISTRY ?? "").trim().replace(/\/+$/, "")
  }

  /** Registry username for docker login / image pull secret (optional if public). */
  get buildRegistryUsername(): string {
    return (
      process.env.HOSTRIG_BUILD_REGISTRY_USERNAME ??
      process.env.HOSTRIG_BUILD_REGISTRY_USER ??
      ""
    ).trim()
  }

  /** Registry password or token for push + pull. */
  get buildRegistryPassword(): string {
    return (
      process.env.HOSTRIG_BUILD_REGISTRY_PASSWORD ??
      process.env.HOSTRIG_BUILD_REGISTRY_TOKEN ??
      ""
    ).trim()
  }

  /**
   * Hostname for docker login (defaults to first path segment of registry).
   * e.g. registry `ghcr.io/myorg/hostrig` → server `ghcr.io`.
   */
  get buildRegistryServer(): string {
    const explicit = (
      process.env.HOSTRIG_BUILD_REGISTRY_SERVER ?? ""
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
    return (process.env.HOSTRIG_GITHUB_APP_ID ?? "").trim()
  }

  get githubAppClientId(): string {
    return (process.env.HOSTRIG_GITHUB_APP_CLIENT_ID ?? "").trim()
  }

  get githubAppClientSecret(): string {
    return (process.env.HOSTRIG_GITHUB_APP_CLIENT_SECRET ?? "").trim()
  }

  get githubAppPrivateKey(): string {
    return (process.env.HOSTRIG_GITHUB_APP_PRIVATE_KEY ?? "").trim()
  }

  get githubAppWebhookSecret(): string {
    return (process.env.HOSTRIG_GITHUB_APP_WEBHOOK_SECRET ?? "").trim()
  }

  get githubAppSlug(): string {
    return (process.env.HOSTRIG_GITHUB_APP_SLUG ?? "").trim()
  }

  get gitlabOAuthClientId(): string {
    return (process.env.HOSTRIG_GITLAB_OAUTH_CLIENT_ID ?? "").trim()
  }

  get gitlabOAuthClientSecret(): string {
    return (process.env.HOSTRIG_GITLAB_OAUTH_CLIENT_SECRET ?? "").trim()
  }

  get gitlabOAuthBaseUrl(): string {
    return (
      process.env.HOSTRIG_GITLAB_OAUTH_BASE_URL ??
      process.env.HOSTRIG_GITLAB_URL ??
      "https://gitlab.com"
    )
      .trim()
      .replace(/\/$/, "")
  }

  /* ── Observe (optional; requires ClickHouse when enabled) ───── */

  get observeEnabled(): boolean {
    return boolEnv("HOSTRIG_OBSERVE_ENABLED", false)
  }

  get clickhouseUrl(): string {
    return (
      process.env.HOSTRIG_CLICKHOUSE_URL ?? "http://127.0.0.1:8123"
    ).trim()
  }

  get clickhouseDatabase(): string {
    return (process.env.HOSTRIG_CLICKHOUSE_DATABASE ?? "hostrig_observe").trim()
  }

  get clickhouseUser(): string {
    return (process.env.HOSTRIG_CLICKHOUSE_USER ?? "hostrig").trim()
  }

  get clickhousePassword(): string {
    return process.env.HOSTRIG_CLICKHOUSE_PASSWORD ?? "hostrig"
  }

  get observeIngestUrl(): string {
    const explicit = (process.env.HOSTRIG_OBSERVE_INGEST_URL ?? "").trim()
    if (explicit) return explicit.replace(/\/$/, "")
    return this.betterAuthUrl.replace(/\/$/, "")
  }

  get observeStagingDir(): string {
    return (
      process.env.HOSTRIG_OBSERVE_STAGING_DIR ??
      pathFromCwd("data/observe/ingest")
    )
  }

  get observeDefaultMaxEvents(): number {
    return numEnv("HOSTRIG_OBSERVE_DEFAULT_MAX_EVENTS", 10_000)
  }

  get observeDefaultRetentionDays(): number {
    return numEnv("HOSTRIG_OBSERVE_DEFAULT_RETENTION_DAYS", 30)
  }

  /**
   * Dogfood: send this app's own Sentry SDK traffic into Observe.
   * Defaults ON in development when Observe is enabled.
   * Set HOSTRIG_OBSERVE_DOGFOOD=0 to disable. Production needs
   * HOSTRIG_OBSERVE_DOGFOOD_FORCE=1.
   */
  get observeDogfood(): boolean {
    if (!this.observeEnabled) return false
    const raw = process.env.HOSTRIG_OBSERVE_DOGFOOD
    if (raw !== undefined && raw !== "") {
      return !["0", "false", "no", "off"].includes(raw.toLowerCase())
    }
    if (this.isDev) return true
    return boolEnv("HOSTRIG_OBSERVE_DOGFOOD_FORCE", false)
  }

  /** Explicit DSN (http://key@host/sentryId). Also accepted as VITE_… for the browser. */
  get observeDogfoodDsn(): string {
    return (
      process.env.HOSTRIG_OBSERVE_DOGFOOD_DSN ??
      process.env.VITE_HOSTRIG_OBSERVE_DOGFOOD_DSN ??
      ""
    ).trim()
  }

  /** Optional Deploy project UUID to auto-build a dogfood DSN from. */
  get observeDogfoodProjectId(): string {
    return (process.env.HOSTRIG_OBSERVE_DOGFOOD_PROJECT_ID ?? "").trim()
  }

  get otelcolUrl(): string {
    return (
      process.env.HOSTRIG_OTELCOL_URL ?? "http://127.0.0.1:4318"
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
