import { MinioS3Adapter } from "./minio"
import { R2S3Adapter } from "./r2"
import type { S3Adapter, S3AdapterConfig, S3ProviderKind } from "./types"

export type { S3Adapter, S3AdapterConfig, S3ProviderKind }
export { MinioS3Adapter } from "./minio"
export { R2S3Adapter } from "./r2"

export function createS3Adapter(config: S3AdapterConfig): S3Adapter {
  switch (config.provider) {
    case "r2":
      return new R2S3Adapter(config)
    case "minio":
      return new MinioS3Adapter(config)
    default: {
      const _exhaustive: never = config.provider
      throw new Error(`Unknown S3 provider: ${String(_exhaustive)}`)
    }
  }
}

/** Derive R2 S3 API endpoint from account id. */
export function r2EndpointForAccount(accountId: string): string {
  const id = accountId.trim()
  if (!id) throw new Error("DEPLOW_R2_ACCOUNT_ID is required for provider=r2")
  return `https://${id}.r2.cloudflarestorage.com`
}
