import { env } from "@/lib/env"

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

/**
 * Load platform connection settings from the central env module.
 * Safe defaults target the local docker-compose stack.
 */
export function loadPlatformConfig(): PlatformConfig {
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
    minioEndpoint: env.minioEndpoint,
    minioAccessKey: env.minioAccessKey,
    minioSecretKey: env.minioSecretKey,
    minioRegion: env.minioRegion,
    minioPublicEndpoint: env.minioPublicEndpoint,
    minioDockerEndpoint: env.minioDockerEndpoint,
    backupBucket: env.backupBucket,
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
