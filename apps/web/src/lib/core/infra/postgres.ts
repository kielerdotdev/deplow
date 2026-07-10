import pg from "pg"

import type { DatabaseCredentials } from "@deplow/shared"

import { randomPassword, sanitizeIdentifier } from "../crypto"
import type { PlatformConfig } from "../platform-config"

const ADMIN_TIMEOUT_DELAY = 5000

export class PostgresProvisioner {
  constructor(private readonly config: PlatformConfig) {}

  async createDatabase(projectSlug: string): Promise<DatabaseCredentials> {
    const role = sanitizeIdentifier(`p_${projectSlug}`)
    const database = sanitizeIdentifier(`d_${projectSlug}`)
    const password = randomPassword(28)

    await this.withAdmin(async (client) => {
      await terminateBackendSessions(client, database)
      await upsertRole(client, role, password)
      await upsertDatabase(client, database, role)
    })

    await this.grantSchemaPrivileges(role, password, database, projectSlug)

    return {
      host: this.config.postgresHost,
      port: this.config.postgresPort,
      database,
      user: role,
      password,
      url: this.buildUrl(role, password, database),
    }
  }

  async dropDatabase(projectSlug: string): Promise<void> {
    const role = sanitizeIdentifier(`p_${projectSlug}`)
    const database = sanitizeIdentifier(`d_${projectSlug}`)

    await this.withAdmin(async (client) => {
      await terminateBackendSessions(client, database)
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(database)}`)
      await client.query(`DROP ROLE IF EXISTS ${quoteIdent(role)}`)
    })
  }

  async dumpDatabase(creds: DatabaseCredentials): Promise<Buffer> {
    const client = new pg.Client({ connectionString: creds.url })
    await client.connect()
    try {
      const tables = await listPublicTables(client)

      const parts: string[] = [
        `-- deplow backup for ${creds.database}`,
        `SET client_encoding = 'UTF8';`,
        "",
      ]

      for (const { tablename } of tables.rows) {
        const columns = await listTableColumns(client, tablename)
        const rows = await client.query(`SELECT * FROM ${quoteIdent(tablename)}`)
        parts.push(...dumpTable(tablename, columns.rows, rows.rows))
      }

      return Buffer.from(parts.join("\n"), "utf8")
    } finally {
      await client.end()
    }
  }

  // ── internal helpers ──────────────────────────────────────────

  private async withAdmin<T>(
    fn: (client: pg.Client) => Promise<T>,
  ): Promise<T> {
    const client = new pg.Client({
      connectionString: this.config.postgresAdminUrl,
    })
    await client.connect()
    try {
      return await fn(client)
    } finally {
      await client.end()
    }
  }

  private async grantSchemaPrivileges(
    role: string,
    password: string,
    database: string,
    projectSlug: string,
  ): Promise<void> {
    const dbClient = new pg.Client({
      connectionString: this.buildUrl(role, password, database),
    })
    await dbClient.connect()
    try {
      await dbClient.query(`GRANT ALL ON SCHEMA public TO ${quoteIdent(role)}`)
      await dbClient.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${quoteIdent(role)}`,
      )
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS deplow_meta (
          key text PRIMARY KEY,
          value text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await dbClient.query(
        `
        INSERT INTO deplow_meta (key, value)
        VALUES ('project_slug', $1)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `,
        [projectSlug],
      )
    } finally {
      await dbClient.end()
    }
  }

  private buildUrl(user: string, password: string, database: string): string {
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${this.config.postgresHost}:${this.config.postgresPort}/${database}`
  }
}

// ── module-level helpers (pure, no state) ────────────────────────

async function terminateBackendSessions(
  client: pg.Client,
  database: string,
): Promise<void> {
  // Sessions may not exist — ignore errors so re-provisioning works
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

async function upsertRole(
  client: pg.Client,
  role: string,
  password: string,
): Promise<void> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM pg_roles WHERE rolname = $1`,
    [role],
  )
  if (rowCount === 0) {
    await client.query(
      `CREATE ROLE ${quoteIdent(role)} LOGIN PASSWORD ${quoteLiteral(password)}`,
    )
    return
  }
  await client.query(
    `ALTER ROLE ${quoteIdent(role)} WITH PASSWORD ${quoteLiteral(password)}`,
  )
}

async function upsertDatabase(
  client: pg.Client,
  database: string,
  role: string,
): Promise<void> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [database],
  )
  if (rowCount === 0) {
    await client.query(
      `CREATE DATABASE ${quoteIdent(database)} OWNER ${quoteIdent(role)}`,
    )
    return
  }
  await client.query(
    `ALTER DATABASE ${quoteIdent(database)} OWNER TO ${quoteIdent(role)}`,
  )
  await client.query(
    `GRANT ALL PRIVILEGES ON DATABASE ${quoteIdent(database)} TO ${quoteIdent(role)}`,
  )
}

async function listPublicTables(client: pg.Client) {
  return client.query<{ tablename: string }>(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `)
}

async function listTableColumns(
  client: pg.Client,
  tablename: string,
) {
  return client.query<{ column_name: string }>(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
    `,
    [tablename],
  )
}

function dumpTable(
  tablename: string,
  columns: { column_name: string }[],
  rows: Record<string, unknown>[],
): string[] {
  const colList = columns.map((c) => quoteIdent(c.column_name)).join(", ")
  const parts = [`-- table ${tablename}`, `TRUNCATE TABLE ${quoteIdent(tablename)} CASCADE;`]
  for (const row of rows) {
    const values = columns
      .map((c) => sqlLiteral(row[c.column_name]))
      .join(", ")
    parts.push(
      `INSERT INTO ${quoteIdent(tablename)} (${colList}) VALUES (${values});`,
    )
  }
  parts.push("")
  return parts
}

export function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`
}

export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "number" || typeof value === "bigint")
    return String(value)
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  if (value instanceof Date) return quoteLiteral(value.toISOString())
  if (typeof value === "object") return quoteLiteral(JSON.stringify(value))
  return quoteLiteral(String(value))
}

void ADMIN_TIMEOUT_DELAY