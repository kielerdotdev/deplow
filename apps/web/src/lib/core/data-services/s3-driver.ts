import type { StorageCredentials } from "@hostrig/shared"

import { StorageProvisioner } from "../infra/storage"
import type { PlatformConfig } from "../platform-config"
import type {
  DataServiceDriver,
  DestroyContext,
  ProvisionContext,
} from "./types"

export class S3SharedDriver implements DataServiceDriver {
  readonly kind = "s3" as const
  readonly source = "shared-instance" as const
  readonly capabilities = {
    backup: false,
    pitr: false,
    principals: false,
    exportImport: false,
  }

  private readonly storage: StorageProvisioner

  constructor(config: PlatformConfig) {
    this.storage = new StorageProvisioner(config)
  }

  async provision(ctx: ProvisionContext): Promise<StorageCredentials> {
    await this.storage.ensureBackupBucket()
    return this.storage.createBucket(ctx.projectSlug)
  }

  async destroy(ctx: DestroyContext): Promise<void> {
    const credentials = ctx.credentials as StorageCredentials | null
    if (!credentials) return
    await this.storage.destroyBucket(
      credentials.bucket,
      credentials.accessKeyId,
    )
  }
}
