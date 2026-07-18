import type { DatabaseCredentials } from "@hostrig/shared"

import { randomPassword, sanitizeIdentifier } from "../crypto"
import { PostgresInstance } from "../infra/postgres"
import type { PlatformConfig } from "../platform-config"
import { DataContainerRuntime } from "./container-runtime"
import type {
  BackupCapable,
  BackupResult,
  CreatedPrincipal,
  DataServiceDriver,
  DestroyContext,
  PitrCapable,
  PrincipalInfo,
  PrincipalsCapable,
  ProvisionContext,
} from "./types"
import type { PitrWindow } from "../pitr.service"

function pitrEnabled(): boolean {
  return process.env.HOSTRIG_PITR_ENABLED === "1"
}

export class PostgresContainerDriver implements DataServiceDriver {
  readonly kind = "postgres" as const
  readonly source = "dedicated-container" as const
  readonly defaultEnvKey = "DATABASE_URL"
  readonly capabilities = {
    backup: true,
    pitr: true,
    principals: true,
    exportImport: false,
  }

  readonly backup: BackupCapable
  readonly pitr: PitrCapable
  readonly principals: PrincipalsCapable
  private readonly runtime: DataContainerRuntime

  constructor(private readonly config: PlatformConfig) {
    this.runtime = new DataContainerRuntime(config)
    this.backup = {
      backup: async (credentials) => {
        const dump = await new PostgresInstance(
          credentials as DatabaseCredentials,
        ).dumpDatabase()
        return {
          body: dump,
          contentType: "application/octet-stream",
          kind: "postgres" as const,
          keySuffix: "postgres.dump",
        } satisfies BackupResult
      },
      restore: async (credentials, body) => {
        await new PostgresInstance(
          credentials as DatabaseCredentials,
        ).restoreDatabase(body)
      },
    }
    this.principals = makePrincipals()
    this.pitr = makePitr(this.runtime)
  }

  async provision(ctx: ProvisionContext): Promise<DatabaseCredentials> {
    const user = sanitizeIdentifier(`p_${ctx.projectSlug}`)
    const database = sanitizeIdentifier(`d_${ctx.projectSlug}`)
    const password = randomPassword(28)
    const pitr = pitrEnabled()

    const cmd = [
      "postgres",
      "-c",
      "wal_level=replica",
      ...(pitr
        ? [
            "-c",
            "archive_mode=on",
            "-c",
            "archive_timeout=60",
            "-c",
            "archive_command=test ! -f /var/lib/postgresql/archive/%f && cp %p /var/lib/postgresql/archive/%f",
          ]
        : []),
    ]

    const running = await this.runtime.create({
      kind: "postgres",
      projectId: ctx.projectId,
      projectSlug: ctx.projectSlug,
      image: this.config.postgresImage,
      env: [
        `POSTGRES_USER=${user}`,
        `POSTGRES_PASSWORD=${password}`,
        `POSTGRES_DB=${database}`,
      ],
      cmd,
      containerPort: 5432,
      dataPath: "/var/lib/postgresql/data",
    })

    const operatorUrl = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${running.operatorHost}:${running.operatorPort}/${database}`

    // Wait a beat then stamp meta
    const instance = new PostgresInstance({
      host: running.operatorHost,
      port: running.operatorPort,
      database,
      user,
      password,
      url: operatorUrl,
    })
    try {
      const pg = await import("pg")
      const client = new pg.default.Client({ connectionString: operatorUrl })
      await client.connect()
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS hostrig_meta (
            key text PRIMARY KEY,
            value text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
          )
        `)
        await client.query(
          `
          INSERT INTO hostrig_meta (key, value) VALUES ('project_slug', $1)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
          `,
          [ctx.projectSlug],
        )
        await client.query(
          `
          INSERT INTO hostrig_meta (key, value) VALUES ('project_id', $1)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
          `,
          [ctx.projectId],
        )
      } finally {
        await client.end()
      }
    } catch {
      void instance
    }

    return {
      host: running.runtimeHost,
      port: running.runtimePort,
      database,
      user,
      password,
      url: operatorUrl,
    }
  }

  async destroy(ctx: DestroyContext): Promise<void> {
    await this.runtime.destroy("postgres", ctx.projectSlug, ctx.projectId)
  }
}

function makePrincipals(): PrincipalsCapable {
  return {
    async list(credentials, projectSlug) {
      const roles = await new PostgresInstance(
        credentials as DatabaseCredentials,
      ).listRoles(projectSlug)
      return roles.map(
        (r): PrincipalInfo => ({
          name: r.name,
          isPrimary: r.isAppRole,
          meta: { canLogin: r.canLogin },
        }),
      )
    },
    async create(credentials, projectSlug, name, options) {
      const preset = options?.preset === "readwrite" ? "readwrite" : "readonly"
      const created = await new PostgresInstance(
        credentials as DatabaseCredentials,
      ).createRole(projectSlug, name, preset)
      return {
        name: created.name,
        password: created.password,
      } satisfies CreatedPrincipal
    },
    async rotate(credentials, projectSlug, name) {
      void projectSlug
      return new PostgresInstance(
        credentials as DatabaseCredentials,
      ).rotateRolePassword(name)
    },
    async drop(credentials, projectSlug, name) {
      await new PostgresInstance(credentials as DatabaseCredentials).dropRole(
        projectSlug,
        name,
      )
    },
    applyPrimaryRotation(credentials, _projectSlug, name, password) {
      const creds = credentials as DatabaseCredentials
      if (name !== creds.user) return null
      const next = { ...creds, password }
      if (creds.url) {
        try {
          const u = new URL(creds.url)
          u.password = password
          next.url = u.href.replace(/\/$/, "")
        } catch {
          next.url = undefined
        }
      }
      return next
    },
  }
}

function makePitr(runtime: DataContainerRuntime): PitrCapable {
  return {
    async status(ctx): Promise<PitrWindow> {
      const stanza = ctx.projectId
      if (!pitrEnabled()) {
        return {
          enabled: false,
          stanza,
          windowStart: null,
          windowEnd: null,
          lastBaseBackupAt: null,
          message:
            "Set HOSTRIG_PITR_ENABLED=1 and configure pgBackRest for this project stanza.",
        }
      }
      try {
        const volumeName = runtime.volumeName("postgres", ctx.projectSlug)
        const info = await runPgbackrest(
          [`--stanza=${stanza}`, "info", "--output=json"],
          { volumeName },
        )
        const parsed = JSON.parse(info) as Array<{
          backup?: Array<{ timestamp?: { start?: number; stop?: number } }>
        }>
        const backups = parsed[0]?.backup ?? []
        const last = backups[backups.length - 1]
        const stop = last?.timestamp?.stop
        const start = backups[0]?.timestamp?.start
        return {
          enabled: true,
          stanza,
          windowStart: start ? new Date(start * 1000).toISOString() : null,
          windowEnd: stop
            ? new Date(stop * 1000).toISOString()
            : new Date().toISOString(),
          lastBaseBackupAt: stop ? new Date(stop * 1000).toISOString() : null,
          ...(backups.length === 0
            ? {
                message:
                  "Stanza is configured but has no base backup yet. Run a full backup (pgbackrest backup --type=full).",
              }
            : {}),
        }
      } catch (error) {
        return {
          enabled: true,
          stanza,
          windowStart: null,
          windowEnd: null,
          lastBaseBackupAt: null,
          message:
            error instanceof Error
              ? error.message
              : "pgBackRest info unavailable for this project",
        }
      }
    },

    async restoreToTime(ctx, targetAt) {
      if (!pitrEnabled()) {
        throw new Error("PITR is not enabled")
      }
      const stanza = ctx.projectId
      const volumeName = runtime.volumeName("postgres", ctx.projectSlug)
      const target = targetAt
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d{3}Z$/, "")

      await runtime.stop("postgres", ctx.projectSlug)

      try {
        await runPgbackrest(
          [
            `--stanza=${stanza}`,
            "restore",
            "--type=time",
            `--target=${target}`,
            "--target-action=promote",
            "--pg1-path=/var/lib/postgresql/data",
          ],
          { volumeName, requireVolume: true },
        )
      } catch (error) {
        throw new Error(
          `pgbackrest restore failed for stanza ${stanza} / volume ${volumeName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }

      await runtime.start("postgres", ctx.projectSlug)
    },
  }
}

async function runPgbackrest(
  args: string[],
  opts: { volumeName?: string; requireVolume?: boolean } = {},
): Promise<string> {
  const { spawn } = await import("node:child_process")
  const { access } = await import("node:fs/promises")
  const path = await import("node:path")

  const env = { ...process.env }
  const configRaw = process.env.PGBACKREST_CONFIG
  let configAbs: string | undefined
  if (configRaw) {
    configAbs = path.isAbsolute(configRaw)
      ? configRaw
      : path.resolve(process.cwd(), configRaw)
    try {
      await access(configAbs)
    } catch {
      const alt = path.resolve(process.cwd(), "../..", configRaw)
      try {
        await access(alt)
        configAbs = alt
      } catch {
        /* keep original */
      }
    }
    env.PGBACKREST_CONFIG = configAbs
  }

  const capture = (command: string, cmdArgs: string[]) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(command, cmdArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env,
      })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (c: Buffer) => {
        stdout += c.toString()
      })
      child.stderr.on("data", (c: Buffer) => {
        stderr += c.toString()
      })
      child.on("error", (err) => reject(err))
      child.on("close", (code) => {
        if (code === 0) resolve(stdout)
        else
          reject(
            new Error(
              `${command} exited ${code}: ${(stderr || stdout).slice(0, 800)}`,
            ),
          )
      })
    })

  try {
    return await capture("pgbackrest", args)
  } catch (hostError) {
    const dockerBin = process.env.HOSTRIG_DOCKER_BIN ?? "docker"
    const image =
      process.env.HOSTRIG_PGBACKREST_IMAGE ?? "woblerr/pgbackrest:2.58.0-alpine"
    if (!opts.volumeName && opts.requireVolume) {
      throw hostError
    }
    const dockerArgs = [
      "run",
      "--rm",
      "--entrypoint",
      "pgbackrest",
      "--network",
      "host",
    ]
    if (opts.volumeName) {
      dockerArgs.push("-v", `${opts.volumeName}:/var/lib/postgresql/data`)
    }
    if (configAbs) {
      dockerArgs.push(
        "-v",
        `${configAbs}:/etc/pgbackrest/pgbackrest.conf:ro`,
        "-e",
        "PGBACKREST_CONFIG=/etc/pgbackrest/pgbackrest.conf",
      )
    }
    dockerArgs.push(image, ...args)
    try {
      return await capture(dockerBin, dockerArgs)
    } catch (dockerError) {
      const hostMsg =
        hostError instanceof Error ? hostError.message : String(hostError)
      const dockerMsg =
        dockerError instanceof Error ? dockerError.message : String(dockerError)
      throw new Error(
        `pgbackrest unavailable on host (${hostMsg}); docker fallback failed: ${dockerMsg}`,
      )
    }
  }
}
