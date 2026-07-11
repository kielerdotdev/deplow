import type { CreateProjectInput, ProjectCredentials } from "@deplow/shared"

import { encryptString } from "./crypto"
import { PostgresProvisioner } from "./infra/postgres"
import { RedisProvisioner } from "./infra/redis"
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
    const { slug, credentials } = input

    // Drop infrastructure resources — best-effort, don't fail on partial errors
    await safeDrop(this.postgres.dropDatabase(slug), "postgres")
    await safeDrop(this.redis.destroyNamespace(slug), "redis")

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

/**
 * Best-effort resource teardown — logs the error but never throws,
 * so a failure in one resource doesn't prevent cleanup of others.
 */
async function safeDrop(
  promise: Promise<unknown>,
  label: string,
): Promise<void> {
  try {
    await promise
  } catch (error) {
    console.warn(
      `[deplow] failed to drop ${label} resource:`,
      error instanceof Error ? error.message : error,
    )
  }
}
