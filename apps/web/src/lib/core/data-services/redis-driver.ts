import type { RedisCredentials } from "@deplow/shared"

import { randomPassword, sanitizeIdentifier } from "../crypto"
import { RedisInstance } from "../infra/redis"
import type { PlatformConfig } from "../platform-config"
import { DataContainerRuntime } from "./container-runtime"
import type {
  BackupCapable,
  BackupResult,
  CreatedPrincipal,
  DataServiceDriver,
  DestroyContext,
  ExportImportCapable,
  PrincipalInfo,
  PrincipalsCapable,
  ProvisionContext,
} from "./types"

export class RedisContainerDriver implements DataServiceDriver {
  readonly kind = "redis" as const
  readonly source = "dedicated-container" as const
  readonly defaultEnvKey = "REDIS_URL"
  readonly capabilities = {
    backup: true,
    pitr: false,
    principals: true,
    exportImport: true,
  }

  readonly backup: BackupCapable
  readonly principals: PrincipalsCapable
  readonly exportImport: ExportImportCapable
  private readonly runtime: DataContainerRuntime

  constructor(private readonly config: PlatformConfig) {
    this.runtime = new DataContainerRuntime(config)
    this.backup = {
      backup: async (credentials) => {
        const body = await new RedisInstance(
          credentials as RedisCredentials,
        ).dumpRdbOrExport()
        return {
          body,
          contentType: "application/json",
          kind: "redis" as const,
          keySuffix: "redis.json",
        } satisfies BackupResult
      },
      restore: async (credentials, body) => {
        await new RedisInstance(
          credentials as RedisCredentials,
        ).restoreFromExport(body)
      },
    }
    this.principals = makePrincipals()
    this.exportImport = {
      export: async (credentials) =>
        new RedisInstance(credentials as RedisCredentials).exportAll(),
      import: async (credentials, _slug, body) =>
        new RedisInstance(credentials as RedisCredentials).importAll(body),
    }
  }

  async provision(ctx: ProvisionContext): Promise<RedisCredentials> {
    const password = randomPassword(28)
    const username = sanitizeIdentifier(`u_${ctx.projectSlug}`)

    const running = await this.runtime.create({
      kind: "redis",
      projectId: ctx.projectId,
      projectSlug: ctx.projectSlug,
      image: this.config.redisImage,
      env: [`DEPLOW_REDIS_PASSWORD=${password}`],
      cmd: ["redis-server", "--requirepass", password, "--appendonly", "yes"],
      containerPort: 6379,
      dataPath: "/data",
    })

    const operatorUrl = `redis://:${encodeURIComponent(password)}@${running.operatorHost}:${running.operatorPort}`

    return {
      host: running.runtimeHost,
      port: running.runtimePort,
      password,
      namespace: username,
      url: operatorUrl,
    }
  }

  async destroy(ctx: DestroyContext): Promise<void> {
    await this.runtime.destroy("redis", ctx.projectSlug, ctx.projectId)
  }
}

function makePrincipals(): PrincipalsCapable {
  return {
    async list(credentials, projectSlug) {
      const users = await new RedisInstance(
        credentials as RedisCredentials,
      ).listUsers(projectSlug)
      return users.map(
        (u): PrincipalInfo => ({
          name: u.username,
          isPrimary: u.isAppUser,
        }),
      )
    },
    async create(credentials, projectSlug, name) {
      const created = await new RedisInstance(
        credentials as RedisCredentials,
      ).createUser(projectSlug, name)
      return {
        name: created.username,
        password: created.password,
      } satisfies CreatedPrincipal
    },
    async rotate(credentials, projectSlug, name) {
      const rotated = await new RedisInstance(
        credentials as RedisCredentials,
      ).rotateUserPassword(projectSlug, name)
      return { name: rotated.username, password: rotated.password }
    },
    async drop(credentials, projectSlug, name) {
      await new RedisInstance(credentials as RedisCredentials).dropUser(
        projectSlug,
        name,
      )
    },
    applyPrimaryRotation(credentials, projectSlug, name, password) {
      const creds = credentials as RedisCredentials
      const primary = sanitizeIdentifier(`u_${projectSlug}`)
      if (name !== "default" && name !== primary) return null
      const next = { ...creds, password }
      if (creds.url) {
        try {
          const u = new URL(creds.url)
          next.url = `redis://:${encodeURIComponent(password)}@${u.hostname}:${u.port || "6379"}`
        } catch {
          next.url = `redis://:${encodeURIComponent(password)}@127.0.0.1:${creds.port}`
        }
      }
      return next
    },
  }
}
