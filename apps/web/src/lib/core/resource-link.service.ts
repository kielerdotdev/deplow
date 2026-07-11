import type {
  DatabaseCredentials,
  ProjectCredentials,
  RedisCredentials,
  ResourceCredentials,
  ResourceKind,
  StorageCredentials,
} from "@deplow/shared"

import { decryptString, encryptString } from "./crypto"
import { PostgresProvisioner } from "./infra/postgres"
import { RedisProvisioner } from "./infra/redis"
import { StorageProvisioner } from "./infra/storage"
import type { PlatformConfig } from "./platform-config"

export class ResourceLinkService {
  private readonly postgres: PostgresProvisioner
  private readonly redis: RedisProvisioner
  private readonly storage: StorageProvisioner

  constructor(private readonly config: PlatformConfig) {
    this.postgres = new PostgresProvisioner(config)
    this.redis = new RedisProvisioner(config)
    this.storage = new StorageProvisioner(config)
  }

  async provision(kind: ResourceKind, projectSlug: string): Promise<string> {
    let credentials: ResourceCredentials
    if (kind === "postgres") {
      credentials = await this.postgres.createDatabase(projectSlug)
    } else if (kind === "redis") {
      credentials = await this.redis.createNamespace(projectSlug)
    } else {
      await this.storage.ensureBackupBucket()
      credentials = await this.storage.createBucket(projectSlug)
    }
    return this.encrypt(credentials)
  }

  async destroy(
    kind: ResourceKind,
    projectSlug: string,
    encrypted: string | null,
  ): Promise<void> {
    if (kind === "postgres") {
      await this.postgres.dropDatabase(projectSlug)
      return
    }
    if (kind === "redis") {
      await this.redis.destroyNamespace(projectSlug)
      return
    }
    const credentials = encrypted
      ? (this.decrypt(encrypted) as StorageCredentials)
      : null
    if (credentials) {
      await this.storage.destroyBucket(
        credentials.bucket,
        credentials.accessKeyId,
      )
    }
  }

  encrypt(credentials: ResourceCredentials): string {
    return encryptString(
      JSON.stringify(credentials),
      this.config.secretsEncryptionKey,
    )
  }

  decrypt(encrypted: string): ResourceCredentials {
    return JSON.parse(
      decryptString(encrypted, this.config.secretsEncryptionKey),
    ) as ResourceCredentials
  }

  assemble(
    links: Array<{ kind: string; credentialsEncrypted: string | null }>,
  ): ProjectCredentials | null {
    const result: Partial<ProjectCredentials> = {}
    for (const link of links) {
      if (!link.credentialsEncrypted) continue
      const credentials = this.decrypt(link.credentialsEncrypted)
      if (link.kind === "postgres") {
        result.database = credentials as DatabaseCredentials
      } else if (link.kind === "redis") {
        result.redis = credentials as RedisCredentials
      } else if (link.kind === "s3") {
        result.storage = credentials as StorageCredentials
      }
    }
    if (!result.database || !result.redis || !result.storage) return null
    return result as ProjectCredentials
  }
}
