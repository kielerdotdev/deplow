import type { S3Client } from "@aws-sdk/client-s3"

import type { StorageCredentials } from "@deplow/shared"

import {
  createS3Client,
  deleteBucketQuiet,
  deleteObject,
  emptyBucket,
  ensureBucket,
  getObject,
  projectBucketName,
  putObject,
} from "./ops"
import type { S3Adapter, S3AdapterConfig } from "./types"

/**
 * Cloudflare R2 adapter — creates buckets on demand using account API tokens.
 * R2 has no MinIO-style per-bucket IAM via S3; projects share the configured keys.
 */
export class R2S3Adapter implements S3Adapter {
  readonly provider = "r2" as const
  private readonly client: S3Client

  constructor(private readonly config: S3AdapterConfig) {
    this.client = createS3Client(config, { forcePathStyle: false })
  }

  async ensureBackupBucket(): Promise<void> {
    await ensureBucket(this.client, this.config.backupBucket)
  }

  async createBucket(projectSlug: string): Promise<StorageCredentials> {
    const bucket = projectBucketName(projectSlug)
    await ensureBucket(this.client, bucket)
    return {
      endpoint: this.config.publicEndpoint,
      bucket,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: this.config.region,
    }
  }

  async destroyBucket(bucket: string, _accessKeyId?: string): Promise<void> {
    await emptyBucket(this.client, bucket)
    await deleteBucketQuiet(this.client, bucket)
  }

  putObject(
    bucket: string,
    key: string,
    body: Buffer,
    contentType?: string,
  ): Promise<void> {
    return putObject(this.client, bucket, key, body, contentType)
  }

  getObject(bucket: string, key: string): Promise<Buffer> {
    return getObject(this.client, bucket, key)
  }

  deleteObject(bucket: string, key: string): Promise<void> {
    return deleteObject(this.client, bucket, key)
  }
}
