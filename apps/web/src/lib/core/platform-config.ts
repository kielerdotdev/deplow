import { env } from "@/lib/env"

import {
  r2EndpointForAccount,
  type S3AdapterConfig,
  type S3ProviderKind,
} from "./infra/s3"

export interface PlatformConfig {
  postgresAdminUrl: string
  /** Host:port for host-side clients / secrets.yaml */
  postgresHost: string
  postgresPort: number
  /** Docker Compose DNS name + internal port for app containers */
  postgresDockerHost: string
  postgresDockerPort: number
  /** OCI image for dedicated per-project Postgres */
  postgresImage: string
  redisUrl: string
  redisHost: string
  redisPort: number
  redisDockerHost: string
  redisDockerPort: number
  redisAdminPassword: string
  /** OCI image for dedicated per-project Redis */
  redisImage: string
  /** Operator-provided S3 backend (MinIO or Cloudflare R2) */
  s3: S3AdapterConfig
  /** @deprecated use s3.* — kept for gradual call-site migration */
  minioEndpoint: string
  minioAccessKey: string
  minioSecretKey: string
  minioRegion: string
  minioPublicEndpoint: string
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
  /** GitHub App from env (DB integration row overrides when present) */
  githubAppId: string
  githubAppClientId: string
  githubAppClientSecret: string
  githubAppPrivateKey: string
  githubAppWebhookSecret: string
  githubAppSlug: string
  /** GitLab OAuth Application */
  gitlabOAuthClientId: string
  gitlabOAuthClientSecret: string
  gitlabOAuthBaseUrl: string
}

function resolveS3Config(): S3AdapterConfig {
  const provider: S3ProviderKind = env.s3Provider
  const accessKeyId = env.minioAccessKey
  const secretAccessKey = env.minioSecretKey
  const region = env.minioRegion
  const backupBucket = env.backupBucket

  if (provider === "r2") {
    const explicit =
      process.env.DEPLOW_S3_ENDPOINT?.trim() ||
      process.env.DEPLOW_MINIO_ENDPOINT?.trim() ||
      ""
    const endpoint = explicit || r2EndpointForAccount(env.r2AccountId)
    const publicEndpoint =
      process.env.DEPLOW_S3_PUBLIC_ENDPOINT?.trim() ||
      process.env.DEPLOW_MINIO_PUBLIC_ENDPOINT?.trim() ||
      endpoint
    const appEndpoint =
      process.env.DEPLOW_S3_APP_ENDPOINT?.trim() ||
      process.env.DEPLOW_MINIO_DOCKER_ENDPOINT?.trim() ||
      endpoint
    return {
      provider: "r2",
      endpoint,
      publicEndpoint,
      appEndpoint,
      accessKeyId,
      secretAccessKey,
      region: region || "auto",
      backupBucket,
    }
  }

  return {
    provider: "minio",
    endpoint: env.minioEndpoint,
    publicEndpoint: env.minioPublicEndpoint,
    appEndpoint: env.minioDockerEndpoint,
    accessKeyId,
    secretAccessKey,
    region,
    backupBucket,
    scopedUsers: env.s3ScopedUsers,
    dockerNetwork: env.dockerNetwork,
  }
}

/**
 * Load platform connection settings from the central env module.
 */
export function loadPlatformConfig(): PlatformConfig {
  const s3 = resolveS3Config()
  return {
    postgresAdminUrl: env.postgresAdminUrl,
    postgresHost: env.postgresHost,
    postgresPort: env.postgresPort,
    postgresDockerHost: env.postgresDockerHost,
    postgresDockerPort: env.postgresDockerPort,
    postgresImage: env.postgresImage,
    redisUrl: env.redisUrl,
    redisHost: env.redisHost,
    redisPort: env.redisPort,
    redisDockerHost: env.redisDockerHost,
    redisDockerPort: env.redisDockerPort,
    redisAdminPassword: env.redisPassword,
    redisImage: env.redisImage,
    s3,
    minioEndpoint: s3.endpoint,
    minioAccessKey: s3.accessKeyId,
    minioSecretKey: s3.secretAccessKey,
    minioRegion: s3.region,
    minioPublicEndpoint: s3.publicEndpoint,
    minioDockerEndpoint: s3.appEndpoint,
    backupBucket: s3.backupBucket,
    secretsEncryptionKey: env.secretsEncryptionKey,
    dockerSocketPath: env.dockerSocketPath,
    dockerNetwork: env.dockerNetwork,
    appRuntime: env.appRuntime,
    appRuntimeRequired: env.appRuntimeRequired,
    appMemoryBytes: env.appMemoryBytes,
    appNanoCpus: env.appNanoCpus,
    appReadOnlyRootfs: env.appReadOnlyRootfs,
    baseDomain: env.baseDomain,
    proxyRoutesDir: env.proxyRoutesDir,
    publicUrlProtocol: env.publicUrlProtocol,
    cloudflareTunnelToken: env.cloudflareTunnelToken,
    gitCloneRoot: env.gitCloneRoot,
    publicControlPlaneUrl: env.publicControlPlaneUrl,
    githubToken: env.githubToken,
    gitlabToken: env.gitlabToken,
    githubAppId: env.githubAppId,
    githubAppClientId: env.githubAppClientId,
    githubAppClientSecret: env.githubAppClientSecret,
    githubAppPrivateKey: env.githubAppPrivateKey,
    githubAppWebhookSecret: env.githubAppWebhookSecret,
    githubAppSlug: env.githubAppSlug,
    gitlabOAuthClientId: env.gitlabOAuthClientId,
    gitlabOAuthClientSecret: env.gitlabOAuthClientSecret,
    gitlabOAuthBaseUrl: env.gitlabOAuthBaseUrl,
  }
}

const INSECURE = new Set([
  "replace-me",
  "deplow",
  "deplowsecret",
  "dev-only-change-me-deplow-secrets",
  "changeme",
  "secret",
  "password",
  "test",
])

/**
 * Fail fast in production when auth/secrets or S3 backend are missing/weak.
 * Accepts an optional env bag for tests; defaults to process.env.
 */
export function assertProductionSecrets(
  bag: NodeJS.ProcessEnv = process.env,
): void {
  if (bag.NODE_ENV !== "production") return
  if (bag.VITEST === "true") return

  const missing: string[] = []
  const auth = bag.BETTER_AUTH_SECRET ?? ""
  const secrets = bag.DEPLOW_SECRETS_KEY ?? ""
  if (!auth || auth.length < 32 || INSECURE.has(auth.toLowerCase())) {
    missing.push("BETTER_AUTH_SECRET")
  }
  if (
    secrets &&
    (secrets.length < 32 || INSECURE.has(secrets.toLowerCase()))
  ) {
    if (secrets === "dev-only-change-me-deplow-secrets") {
      throw new Error(
        "DEPLOW_SECRETS_KEY must not use the dev-only fallback in production",
      )
    }
    missing.push("DEPLOW_SECRETS_KEY")
  }

  const access =
    bag.DEPLOW_S3_ACCESS_KEY ?? bag.DEPLOW_MINIO_ACCESS_KEY ?? ""
  const secret =
    bag.DEPLOW_S3_SECRET_KEY ?? bag.DEPLOW_MINIO_SECRET_KEY ?? ""
  if (!access || INSECURE.has(access.toLowerCase())) {
    missing.push("DEPLOW_S3_ACCESS_KEY")
  }
  if (!secret || INSECURE.has(secret.toLowerCase())) {
    missing.push("DEPLOW_S3_SECRET_KEY")
  }

  const provider = (
    bag.DEPLOW_S3_PROVIDER ??
    bag.DEPLOW_OBJECT_STORAGE_PROVIDER ??
    "minio"
  )
    .trim()
    .toLowerCase()
  if (provider === "r2" || provider === "cloudflare-r2") {
    const endpoint = bag.DEPLOW_S3_ENDPOINT?.trim() ?? ""
    const account = bag.DEPLOW_R2_ACCOUNT_ID?.trim() ?? ""
    if (!endpoint && !account) {
      missing.push("DEPLOW_R2_ACCOUNT_ID (or DEPLOW_S3_ENDPOINT)")
    }
  } else {
    const endpoint =
      bag.DEPLOW_S3_ENDPOINT?.trim() ??
      bag.DEPLOW_MINIO_ENDPOINT?.trim() ??
      ""
    if (!endpoint) {
      missing.push("DEPLOW_S3_ENDPOINT")
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required secrets for production: ${missing.join(", ")}`,
    )
  }
}
