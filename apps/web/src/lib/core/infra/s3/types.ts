import type { StorageCredentials } from "@deplow/shared"

export type S3ProviderKind = "minio" | "r2"

/** Operator-provided S3-compatible backend (MinIO or Cloudflare R2). */
export interface S3AdapterConfig {
  provider: S3ProviderKind
  /** Endpoint used by the control plane S3 client */
  endpoint: string
  /** Endpoint returned in credentials / shown to operators */
  publicEndpoint: string
  /** Endpoint injected into app containers as S3_ENDPOINT */
  appEndpoint: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  backupBucket: string
  /**
   * MinIO only: when true, provision per-project IAM users via `mc admin`
   * (requires MinIO reachable on dockerNetwork). R2 always uses shared keys.
   */
  scopedUsers?: boolean
  /** Docker network for optional MinIO `mc` sidecar */
  dockerNetwork?: string
}

export interface S3Adapter {
  readonly provider: S3ProviderKind
  ensureBackupBucket(): Promise<void>
  createBucket(projectSlug: string): Promise<StorageCredentials>
  destroyBucket(bucket: string, accessKeyId?: string): Promise<void>
  putObject(
    bucket: string,
    key: string,
    body: Buffer,
    contentType?: string,
  ): Promise<void>
  getObject(bucket: string, key: string): Promise<Buffer>
  deleteObject(bucket: string, key: string): Promise<void>
}
