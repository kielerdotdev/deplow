import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

import { ensureGitOAuthSchema, ensureServicesSchema } from "./ensure-schema"
import * as schema from "./schema"

/** Package root (`packages/db`) — keeps migrate + web on the same SQLite file. */
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)

const databaseUrl = process.env.DATABASE_URL ?? "data/deplow.db"

function resolveDbPath(filePath: string) {
  if (path.isAbsolute(filePath)) {
    return filePath
  }
  return path.join(packageRoot, filePath)
}

function openSqlite(filePath: string) {
  const absolute = resolveDbPath(filePath)

  fs.mkdirSync(path.dirname(absolute), { recursive: true })

  const sqlite = new Database(absolute)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  // Always apply essential DDL so missing migrate never breaks the app
  ensureGitOAuthSchema(sqlite)
  ensureServicesSchema(sqlite)
  return sqlite
}

const sqlite = openSqlite(databaseUrl)

export const db = drizzle(sqlite, { schema })
