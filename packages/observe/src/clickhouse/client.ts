import { createClient, type ClickHouseClient } from "@clickhouse/client"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type ObserveClickHouseConfig = {
  url: string
  database: string
  username: string
  password: string
}

let client: ClickHouseClient | null = null
let clientKey = ""

export function getClickHouse(config: ObserveClickHouseConfig): ClickHouseClient {
  const key = `${config.url}|${config.database}|${config.username}`
  if (!client || clientKey !== key) {
    client?.close().catch(() => {})
    client = createClient({
      url: config.url,
      database: config.database,
      username: config.username,
      password: config.password,
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 0,
      },
    })
    clientKey = key
  }
  return client
}

export async function pingClickHouse(
  config: ObserveClickHouseConfig,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const ch = getClickHouse(config)
    const ok = await ch.ping()
    return ok.success
      ? { ok: true, detail: `ClickHouse reachable (${config.database})` }
      : { ok: false, detail: "ClickHouse ping failed" }
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function ensureObserveDatabase(
  config: ObserveClickHouseConfig,
): Promise<void> {
  const admin = createClient({
    url: config.url,
    username: config.username,
    password: config.password,
  })
  try {
    await admin.command({
      query: `CREATE DATABASE IF NOT EXISTS ${quoteIdent(config.database)}`,
    })
  } finally {
    await admin.close()
  }
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid ClickHouse database name: ${name}`)
  }
  return name
}

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
)

export async function migrateClickHouse(
  config: ObserveClickHouseConfig,
): Promise<string[]> {
  await ensureObserveDatabase(config)
  const ch = getClickHouse(config)

  await ch.command({
    query: `
      CREATE TABLE IF NOT EXISTS _observe_migrations (
        name String,
        applied_at DateTime64(3) DEFAULT now64(3)
      ) ENGINE = MergeTree
      ORDER BY name
    `,
  })

  const appliedResult = await ch.query({
    query: "SELECT name FROM _observe_migrations",
    format: "JSONEachRow",
  })
  const appliedRows = (await appliedResult.json()) as Array<{ name: string }>
  const applied = new Set(appliedRows.map((r) => r.name))

  if (!fs.existsSync(migrationsDir)) {
    return []
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  const ran: string[] = []
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8")
    // Strip full-line SQL comments so a leading `--` does not discard the whole file.
    const cleaned = sql
      .split("\n")
      .map((line) => (/^\s*--/.test(line) ? "" : line))
      .join("\n")
    const statements = cleaned
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const statement of statements) {
      await ch.command({ query: statement })
    }
    await ch.insert({
      table: "_observe_migrations",
      values: [{ name: file }],
      format: "JSONEachRow",
    })
    ran.push(file)
  }
  return ran
}
