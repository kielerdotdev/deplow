import type { StorageCredentials } from "@deplow/shared"

import type { PlatformConfig } from "../platform-config"
import { createS3Adapter, type S3Adapter } from "./s3"

/**
 * Facade over the configured S3 adapter (MinIO or Cloudflare R2).
 * Creates buckets on demand; backups and project object storage share the same backend.
 */
export class StorageProvisioner {
  private readonly adapter: S3Adapter

  constructor(config: PlatformConfig) {
    this.adapter = createS3Adapter(config.s3)
  }

  ensureBackupBucket(): Promise<void> {
    return this.adapter.ensureBackupBucket()
  }

  createBucket(projectSlug: string): Promise<StorageCredentials> {
    return this.adapter.createBucket(projectSlug)
  }

  destroyBucket(bucket: string, accessKeyId?: string): Promise<void> {
    return this.adapter.destroyBucket(bucket, accessKeyId)
  }

  putObject(
    bucket: string,
    key: string,
    body: Buffer,
    contentType = "application/octet-stream",
  ): Promise<void> {
    return this.adapter.putObject(bucket, key, body, contentType)
  }

  getObject(bucket: string, key: string): Promise<Buffer> {
    return this.adapter.getObject(bucket, key)
  }

  deleteObject(bucket: string, key: string): Promise<void> {
    return this.adapter.deleteObject(bucket, key)
  }
}
