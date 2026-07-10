import type { CreateProjectInput, ProjectCredentials } from "@deplow/shared"

import { encryptString } from "./crypto"
import { PostgresProvisioner } from "./infra/postgres"
import { RedisProvisioner } from "./infra/redis"
import { StorageProvisioner } from "./infra/storage"
import type { PlatformConfig } from "./platform-config"
import { SecretsService } from "./secrets.service"
import type { ServerSpawner } from "./spawners/base"
import { getServerSpawner } from "./spawners/factory"

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
 * Provisions default project resources: production-slot Postgres + Redis + S3 + secrets.
 * Resource names derive from the production slot (preview slots later).
 */
export class ProvisioningService {
  private readonly postgres: PostgresProvisioner
  private readonly redis: RedisProvisioner
  private readonly storage: StorageProvisioner

  constructor(
    private readonly config: PlatformConfig,
    private readonly secretsService = new SecretsService(),
    private readonly spawners: Record<string, ServerSpawner> = {},
  ) {
    this.postgres = new PostgresProvisioner(config)
    this.redis = new RedisProvisioner(config)
    this.storage = new StorageProvisioner(config)
  }

  async createProject(
    input: CreateProjectInput & { projectId?: string },
  ): Promise<CreateProjectResult> {
    const projectId = input.projectId ?? crypto.randomUUID()
    const slug = input.name
    // v1: always provision the production slot (see docs/data-plane.md)
    const resourceName = slug

    const dbCreds = await this.postgres.createDatabase(resourceName)
    const redisCreds = await this.redis.createNamespace(resourceName)
    await this.storage.ensureBackupBucket()
    const storageCreds = await this.storage.createBucket(resourceName)

    const credentials: ProjectCredentials = {
      database: dbCreds,
      redis: redisCreds,
      storage: storageCreds,
      slotKind: "production",
    }

    const secrets = this.secretsService.generateSecretsYaml(credentials)
    const credentialsEncrypted = encryptString(
      JSON.stringify(credentials),
      this.config.secretsEncryptionKey,
    )

    let spawnedServerId: string | undefined
    if (input.spawnBuildServer) {
      const spawner = getServerSpawner(this.spawners, "docker")
      const server = await spawner.spawn({
        name: `${slug}-build`,
        serverType: "docker-alpine",
        ttlMinutes: 30,
        labels: { projectId, slug },
      })
      spawnedServerId = server.id
    }

    return {
      projectId,
      name: input.name,
      slug,
      secrets,
      credentials,
      credentialsEncrypted,
      spawnedServerId,
    }
  }

  async destroyProject(input: DestroyProjectInput): Promise<void> {
    const slug = input.slug
    if (input.credentials) {
      await this.postgres.dropDatabase(slug).catch(() => undefined)
      await this.redis.destroyNamespace(slug).catch(() => undefined)
      await this.storage
        .destroyBucket(
          input.credentials.storage.bucket,
          input.credentials.storage.accessKeyId,
        )
        .catch(() => undefined)
    } else {
      await this.postgres.dropDatabase(slug).catch(() => undefined)
      await this.redis.destroyNamespace(slug).catch(() => undefined)
    }
  }
}
