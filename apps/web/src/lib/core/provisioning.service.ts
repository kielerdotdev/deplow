import type { CreateProjectInput, ProjectCredentials } from "@hostrig/shared"

import { encryptString } from "./crypto"
import { DataServiceRegistry } from "./data-services"
import { StorageProvisioner } from "./infra/storage"
import type { PlatformConfig } from "./platform-config"
import { SecretsService } from "./secrets.service"

export interface CreateProjectResult {
  projectId: string
  name: string
  slug: string
  secrets: string
  credentials: ProjectCredentials
  credentialsEncrypted: string
  spawnedServerId?: string
}

export interface DestroyProjectInput {
  projectId: string
  slug: string
  credentials: ProjectCredentials | null
}

/**
 * Legacy bundled provisioner — prefer ResourceLinkService per-link path.
 * Still used by tests; creates dedicated PG/Redis + shared S3.
 */
export class ProvisioningService {
  private readonly registry: DataServiceRegistry
  private readonly storage: StorageProvisioner

  constructor(
    private readonly config: PlatformConfig,
    private readonly secretsService = new SecretsService(),
  ) {
    this.registry = new DataServiceRegistry(config)
    this.storage = new StorageProvisioner(config)
  }

  async createProject(
    input: CreateProjectInput & { projectId?: string },
  ): Promise<CreateProjectResult> {
    const projectId = input.projectId ?? crypto.randomUUID()
    const slug = input.name

    const database = await this.registry.get("postgres").provision({
      projectId,
      projectSlug: slug,
      resourceLinkId: crypto.randomUUID(),
    })
    const redis = await this.registry.get("redis").provision({
      projectId,
      projectSlug: slug,
      resourceLinkId: crypto.randomUUID(),
    })
    await this.storage.ensureBackupBucket()
    const storage = await this.storage.createBucket(slug)

    const credentials: ProjectCredentials = {
      database: database as ProjectCredentials["database"],
      redis: redis as ProjectCredentials["redis"],
      storage,
      slotKind: "production",
    }

    const secrets = this.secretsService.generateSecretsYaml(credentials)
    const credentialsEncrypted = encryptString(
      JSON.stringify(credentials),
      this.config.secretsEncryptionKey,
    )

    return {
      projectId,
      name: input.name,
      slug,
      secrets,
      credentials,
      credentialsEncrypted,
      spawnedServerId: undefined,
    }
  }

  async destroyProject(input: DestroyProjectInput): Promise<void> {
    const { projectId, slug, credentials } = input
    await safeDrop(
      this.registry.get("postgres").destroy({
        projectId,
        projectSlug: slug,
        resourceLinkId: "",
        credentials: credentials?.database ?? null,
      }),
      "postgres",
    )
    await safeDrop(
      this.registry.get("redis").destroy({
        projectId,
        projectSlug: slug,
        resourceLinkId: "",
        credentials: credentials?.redis ?? null,
      }),
      "redis",
    )

    if (credentials) {
      await safeDrop(
        this.storage.destroyBucket(
          credentials.storage.bucket,
          credentials.storage.accessKeyId,
        ),
        "storage",
      )
    }
  }
}

async function safeDrop(
  promise: Promise<unknown>,
  label: string,
): Promise<void> {
  try {
    await promise
  } catch (error) {
    console.error(`Failed to destroy ${label}:`, error)
  }
}
