import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

import * as schema from "./schema"

const databaseUrl = process.env.DATABASE_URL ?? "data/deplow.db"

function openSqlite(filePath: string) {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath)

  fs.mkdirSync(path.dirname(absolute), { recursive: true })

  const sqlite = new Database(absolute)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  return sqlite
}

const sqlite = openSqlite(databaseUrl)

export const db = drizzle(sqlite, { schema })
