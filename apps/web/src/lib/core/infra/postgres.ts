import pg from "pg"

import type { DatabaseCredentials } from "@deplow/shared"

import { randomPassword, sanitizeIdentifier } from "../crypto"
import type { PlatformConfig } from "../platform-config"

export class PostgresProvisioner {
  constructor(private readonly config: PlatformConfig) {}

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

  async createDatabase(projectSlug: string): Promise<DatabaseCredentials> {
    const role = sanitizeIdentifier(`p_${projectSlug}`)
    const database = sanitizeIdentifier(`d_${projectSlug}`)
    const password = randomPassword(28)

    await this.withAdmin(async (client) => {
      // Terminate existing sessions if re-provisioning
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

      const roleExists = await client.query(
        `SELECT 1 FROM pg_roles WHERE rolname = $1`,
        [role],
      )
      if (roleExists.rowCount === 0) {
        await client.query(
          `CREATE ROLE ${quoteIdent(role)} LOGIN PASSWORD ${quoteLiteral(password)}`,
        )
      } else {
        await client.query(
          `ALTER ROLE ${quoteIdent(role)} WITH PASSWORD ${quoteLiteral(password)}`,
        )
      }

      const dbExists = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [database],
      )
      if (dbExists.rowCount === 0) {
        await client.query(
          `CREATE DATABASE ${quoteIdent(database)} OWNER ${quoteIdent(role)}`,
        )
      } else {
        await client.query(
          `ALTER DATABASE ${quoteIdent(database)} OWNER TO ${quoteIdent(role)}`,
        )
      }

      await client.query(
        `GRANT ALL PRIVILEGES ON DATABASE ${quoteIdent(database)} TO ${quoteIdent(role)}`,
      )
    })

    // Grant schema privileges and seed a meta table for backup smoke tests
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

      await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(database)}`)
      await client.query(`DROP ROLE IF EXISTS ${quoteIdent(role)}`)
    })
  }

  async dumpDatabase(creds: DatabaseCredentials): Promise<Buffer> {
    // Use pg client COPY for a portable SQL dump without shelling out to pg_dump
    // (pg_dump binary may not exist on the control plane). Export schema+data via SQL.
    const client = new pg.Client({ connectionString: creds.url })
    await client.connect()
    try {
      const tables = await client.query<{ tablename: string }>(
        `
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
        `,
      )

      const parts: string[] = [
        `-- deplow backup for ${creds.database}`,
        `SET client_encoding = 'UTF8';`,
        "",
      ]

      for (const { tablename } of tables.rows) {
        const cols = await client.query<{ column_name: string }>(
          `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
          `,
          [tablename],
        )
        const colList = cols.rows
          .map((c) => quoteIdent(c.column_name))
          .join(", ")
        const rows = await client.query(
          `SELECT * FROM ${quoteIdent(tablename)}`,
        )
        parts.push(`-- table ${tablename}`)
        parts.push(`TRUNCATE TABLE ${quoteIdent(tablename)} CASCADE;`)
        for (const row of rows.rows) {
          const values = cols.rows
            .map((c) =>
              sqlLiteral((row as Record<string, unknown>)[c.column_name]),
            )
            .join(", ")
          parts.push(
            `INSERT INTO ${quoteIdent(tablename)} (${colList}) VALUES (${values});`,
          )
        }
        parts.push("")
      }

      return Buffer.from(parts.join("\n"), "utf8")
    } finally {
      await client.end()
    }
  }

  private buildUrl(user: string, password: string, database: string): string {
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${this.config.postgresHost}:${this.config.postgresPort}/${database}`
  }
}

function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`
}

function quoteLiteral(value: string): string {
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
