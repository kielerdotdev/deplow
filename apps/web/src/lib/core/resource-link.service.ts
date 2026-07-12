import type {
  DatabaseCredentials,
  ProjectCredentials,
  RedisCredentials,
  ResourceCredentials,
  ResourceKind,
  StorageCredentials,
} from "@deplow/shared"

import { decryptString, encryptString } from "./crypto"
import { DataServiceRegistry, type DataServiceDriver } from "./data-services"
import type { PlatformConfig } from "./platform-config"

export class ResourceLinkService {
  private readonly registry: DataServiceRegistry

  constructor(private readonly config: PlatformConfig) {
    this.registry = new DataServiceRegistry(config)
  }

  driver(kind: ResourceKind): DataServiceDriver {
    return this.registry.get(kind)
  }

  getRegistry(): DataServiceRegistry {
    return this.registry
  }

  async provision(
    kind: ResourceKind,
    projectSlug: string,
    opts: { projectId: string; resourceLinkId: string },
  ): Promise<string> {
    const driver = this.registry.get(kind)
    const credentials = await driver.provision({
      projectId: opts.projectId,
      projectSlug,
      resourceLinkId: opts.resourceLinkId,
    })
    return this.encrypt(credentials)
  }

  async destroy(
    kind: ResourceKind,
    projectSlug: string,
    encrypted: string | null,
    opts?: { projectId?: string; resourceLinkId?: string },
  ): Promise<void> {
    const driver = this.registry.get(kind)
    const credentials = encrypted
      ? (this.decrypt(encrypted) as ResourceCredentials)
      : null
    await driver.destroy({
      projectId: opts?.projectId ?? "",
      projectSlug,
      resourceLinkId: opts?.resourceLinkId ?? "",
      credentials,
    })
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
