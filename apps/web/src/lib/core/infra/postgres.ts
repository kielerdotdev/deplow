import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import pg from "pg"

import type { DatabaseCredentials } from "@hostrig/shared"

import { randomPassword, sanitizeIdentifier } from "../crypto"

export type PostgresRolePreset = "readwrite" | "readonly"

export type PostgresRoleInfo = {
  name: string
  isAppRole: boolean
  canLogin: boolean
}

/**
 * Postgres admin/ops against a single instance (dedicated container).
 * All methods take DatabaseCredentials — use `url` (operator) when present.
 */
export class PostgresInstance {
  constructor(private readonly creds: DatabaseCredentials) {}

  connectionString(): string {
    return (
      this.creds.url ??
      `postgres://${encodeURIComponent(this.creds.user)}:${encodeURIComponent(this.creds.password)}@${this.creds.host}:${this.creds.port}/${this.creds.database}`
    )
  }

  /** Real pg_dump custom format (-Fc). */
  async dumpDatabase(): Promise<Buffer> {
    const dir = mkdtempSync(path.join(tmpdir(), "hostrig-pgdump-"))
    const outFile = path.join(dir, "backup.dump")
    try {
      await runPgTool("pg_dump", [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        outFile,
        this.connectionString(),
      ])
      return readFileSync(outFile)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  async restoreDatabase(dump: Buffer): Promise<void> {
    const dir = mkdtempSync(path.join(tmpdir(), "hostrig-pgrestore-"))
    const dumpFile = path.join(dir, "backup.dump")
    try {
      writeFileSync(dumpFile, dump)
      await this.withClient(async (client) => {
        await terminateBackendSessions(client, this.creds.database)
      })
      await runPgTool("pg_restore", [
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "--dbname",
        this.connectionString(),
        dumpFile,
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  async listRoles(projectSlug: string): Promise<PostgresRoleInfo[]> {
    const appRole = this.creds.user
    const prefix = `${sanitizeIdentifier(`p_${projectSlug}`)}_`
    return this.withClient(async (client) => {
      const { rows } = await client.query<{
        rolname: string
        rolcanlogin: boolean
      }>(
        `
        SELECT rolname, rolcanlogin
        FROM pg_roles
        WHERE rolname = $1 OR rolname LIKE $2
        ORDER BY rolname
        `,
        [appRole, `${prefix}%`],
      )
      return rows.map((r) => ({
        name: r.rolname,
        isAppRole: r.rolname === appRole,
        canLogin: r.rolcanlogin,
      }))
    })
  }

  async createRole(
    projectSlug: string,
    name: string,
    preset: PostgresRolePreset,
  ): Promise<{ name: string; password: string }> {
    const appRole = this.creds.user
    const database = this.creds.database
    const safe = sanitizeIdentifier(name)
    if (!safe || safe === appRole) {
      throw new Error("Invalid role name")
    }
    const roleName = sanitizeIdentifier(`p_${projectSlug}_${safe}`)
    const password = randomPassword(28)

    await this.withClient(async (client) => {
      const exists = await client.query(
        `SELECT 1 FROM pg_roles WHERE rolname = $1`,
        [roleName],
      )
      if ((exists.rowCount ?? 0) > 0) {
        throw new Error(`Role ${roleName} already exists`)
      }
      await client.query(
        `CREATE ROLE ${quoteIdent(roleName)} LOGIN PASSWORD ${quoteLiteral(password)}`,
      )
      await client.query(
        `GRANT CONNECT ON DATABASE ${quoteIdent(database)} TO ${quoteIdent(roleName)}`,
      )
      await client.query(
        `GRANT USAGE ON SCHEMA public TO ${quoteIdent(roleName)}`,
      )
      if (preset === "readonly") {
        await client.query(
          `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${quoteIdent(roleName)}`,
        )
        await client.query(
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${quoteIdent(roleName)}`,
        )
      } else {
        await client.query(
          `GRANT ALL ON SCHEMA public TO ${quoteIdent(roleName)}`,
        )
        await client.query(
          `GRANT ALL ON ALL TABLES IN SCHEMA public TO ${quoteIdent(roleName)}`,
        )
        await client.query(
          `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdent(roleName)}`,
        )
        await client.query(
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${quoteIdent(roleName)}`,
        )
      }
    })

    return { name: roleName, password }
  }

  async rotateRolePassword(
    roleName: string,
  ): Promise<{ name: string; password: string }> {
    const password = randomPassword(28)
    await this.withClient(async (client) => {
      const exists = await client.query(
        `SELECT 1 FROM pg_roles WHERE rolname = $1`,
        [roleName],
      )
      if ((exists.rowCount ?? 0) === 0) {
        throw new Error(`Role ${roleName} not found`)
      }
      await client.query(
        `ALTER ROLE ${quoteIdent(roleName)} WITH PASSWORD ${quoteLiteral(password)}`,
      )
    })
    return { name: roleName, password }
  }

  async dropRole(projectSlug: string, roleName: string): Promise<void> {
    const appRole = this.creds.user
    if (roleName === appRole) {
      throw new Error("Cannot drop the primary app role")
    }
    const prefix = `${sanitizeIdentifier(`p_${projectSlug}`)}_`
    if (!roleName.startsWith(prefix) && !roleName.startsWith(`${appRole}_`)) {
      throw new Error("Role does not belong to this project")
    }
    await this.withClient(async (client) => {
      await terminateBackendSessions(client, this.creds.database)
      await client
        .query(
          `REASSIGN OWNED BY ${quoteIdent(roleName)} TO ${quoteIdent(appRole)}`,
        )
        .catch(() => undefined)
      await client
        .query(`DROP OWNED BY ${quoteIdent(roleName)}`)
        .catch(() => undefined)
      await client.query(`DROP ROLE IF EXISTS ${quoteIdent(roleName)}`)
    })
  }

  private async withClient<T>(
    fn: (client: pg.Client) => Promise<T>,
  ): Promise<T> {
    const client = new pg.Client({ connectionString: this.connectionString() })
    await client.connect()
    try {
      return await fn(client)
    } finally {
      await client.end()
    }
  }
}

/** @deprecated Prefer PostgresInstance — kept as thin wrapper for call sites. */
export class PostgresProvisioner {
  constructor(_config?: unknown) {}

  async dumpDatabase(creds: DatabaseCredentials): Promise<Buffer> {
    return new PostgresInstance(creds).dumpDatabase()
  }

  async restoreDatabase(
    creds: DatabaseCredentials,
    dump: Buffer,
  ): Promise<void> {
    return new PostgresInstance(creds).restoreDatabase(dump)
  }

  async listRoles(
    projectSlug: string,
    creds: DatabaseCredentials,
  ): Promise<PostgresRoleInfo[]> {
    return new PostgresInstance(creds).listRoles(projectSlug)
  }

  async createRole(
    projectSlug: string,
    name: string,
    preset: PostgresRolePreset,
    creds: DatabaseCredentials,
  ): Promise<{ name: string; password: string }> {
    return new PostgresInstance(creds).createRole(projectSlug, name, preset)
  }

  async rotateRolePassword(
    roleName: string,
    creds: DatabaseCredentials,
  ): Promise<{ name: string; password: string }> {
    return new PostgresInstance(creds).rotateRolePassword(roleName)
  }

  async dropRole(
    projectSlug: string,
    roleName: string,
    creds: DatabaseCredentials,
  ): Promise<void> {
    return new PostgresInstance(creds).dropRole(projectSlug, roleName)
  }

  appRoleName(_projectSlug: string, creds?: DatabaseCredentials): string {
    return creds?.user ?? sanitizeIdentifier(`p_${_projectSlug}`)
  }

  databaseName(_projectSlug: string, creds?: DatabaseCredentials): string {
    return creds?.database ?? sanitizeIdentifier(`d_${_projectSlug}`)
  }

  buildUrl(
    user: string,
    password: string,
    database: string,
    host: string,
    port: number,
  ): string {
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`
  }
}

async function runPgTool(bin: string, args: string[]): Promise<void> {
  try {
    await spawnPgTool(bin, args)
  } catch (error) {
    if (!isMissingBinary(error, bin)) throw error
    await spawnPgToolViaDocker(bin, args)
  }
}

function isMissingBinary(error: unknown, bin: string): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes("ENOENT") ||
    message.includes("failed to start") ||
    message.includes(`spawn ${bin}`)
  )
}

function spawnPgTool(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    })
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("error", (err) => {
      reject(
        new Error(
          `${bin} failed to start: ${err.message}. Is PostgreSQL client tools installed?`,
        ),
      )
    })
    child.on("close", (code) => {
      settlePgToolExit(bin, code, stderr, resolve, reject)
    })
  })
}

/**
 * Host often lacks postgresql-client; run the matching image entrypoint instead.
 * --network host so operator URLs on 127.0.0.1:publishedPort work.
 */
function spawnPgToolViaDocker(bin: string, args: string[]): Promise<void> {
  const dockerBin = process.env.HOSTRIG_DOCKER_BIN ?? "docker"
  const image = process.env.HOSTRIG_POSTGRES_IMAGE ?? "postgres:16-alpine"
  const volumes = new Set<string>()
  for (const arg of args) {
    if (
      arg.startsWith("/") &&
      (arg.includes("hostrig-pgdump-") || arg.includes("hostrig-pgrestore-"))
    ) {
      volumes.add(path.dirname(arg))
    }
  }
  const dockerArgs = ["run", "--rm", "--network", "host", "--entrypoint", bin]
  for (const dir of volumes) {
    dockerArgs.push("-v", `${dir}:${dir}`)
  }
  dockerArgs.push(image, ...args)

  return new Promise((resolve, reject) => {
    const child = spawn(dockerBin, dockerArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    })
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("error", (err) => {
      reject(
        new Error(
          `${bin} via docker failed to start: ${err.message}. Install postgresql-client or ensure Docker can pull ${image}.`,
        ),
      )
    })
    child.on("close", (code) => {
      settlePgToolExit(bin, code, stderr, resolve, reject)
    })
  })
}

function settlePgToolExit(
  bin: string,
  code: number | null,
  stderr: string,
  resolve: () => void,
  reject: (err: Error) => void,
): void {
  if (code === 0) {
    resolve()
    return
  }
  if (bin === "pg_restore" && code === 1 && !/error:/i.test(stderr)) {
    resolve()
    return
  }
  reject(
    new Error(
      `${bin} exited ${code}${stderr.trim() ? `: ${stderr.trim().slice(0, 800)}` : ""}`,
    ),
  )
}

async function terminateBackendSessions(
  client: pg.Client,
  database: string,
): Promise<void> {
  await client
    .query(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
      `,
      [database],
    )
    .catch(() => undefined)
}

export function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`
}

export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}
