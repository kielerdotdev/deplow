#!/usr/bin/env node
/**
 * Print a dogfood DSN for Observe self-ingest.
 *
 * Usage (from repo root, with Observe enabled and a project opened once):
 *   node scripts/observe-dogfood-dsn.mjs
 *
 * Then add to .env:
 *   DEPLOW_OBSERVE_DOGFOOD=1
 *   DEPLOW_OBSERVE_DOGFOOD_DSN=<printed>
 */
import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const candidates = [
  process.env.DEPLOW_SQLITE_PATH,
  process.env.DATABASE_URL?.startsWith("file:")
    ? process.env.DATABASE_URL.replace(/^file:/, "")
    : process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("://")
      ? process.env.DATABASE_URL
      : null,
  path.join(root, "data", "deplow.db"),
  path.join(root, "data", "deplow.sqlite"),
  path.join(root, "apps/web", "data", "deplow.db"),
].filter(Boolean)

function buildDsn({ publicKey, host, sentryId, protocol }) {
  return `${protocol}://${publicKey}@${host}/${sentryId}`
}

function main() {
  const dbPath = candidates.find((p) => fs.existsSync(p))
  if (!dbPath) {
    console.error(
      `No SQLite DB found. Tried:\n${candidates.map((c) => `  ${c}`).join("\n")}`,
    )
    process.exit(1)
  }

  const db = new Database(dbPath, { readonly: true })
  const projectId = process.env.DEPLOW_OBSERVE_DOGFOOD_PROJECT_ID

  const row = projectId
    ? db
        .prepare(
          `SELECT op.project_id AS project_id, op.sentry_id AS sentry_id, ok.public_key AS public_key
           FROM observe_projects op
           JOIN observe_keys ok ON ok.observe_project_id = op.id
           WHERE op.project_id = ? AND ok.revoked_at IS NULL
           LIMIT 1`,
        )
        .get(projectId)
    : db
        .prepare(
          `SELECT op.project_id AS project_id, op.sentry_id AS sentry_id, ok.public_key AS public_key
           FROM observe_projects op
           JOIN observe_keys ok ON ok.observe_project_id = op.id
           WHERE ok.revoked_at IS NULL
           ORDER BY op.sentry_id ASC
           LIMIT 1`,
        )
        .get()

  if (!row) {
    console.error(
      "No Observe project/key found. Open a project under Observe (enables ingest), then re-run.",
    )
    process.exit(1)
  }

  const base = (
    process.env.DEPLOW_OBSERVE_INGEST_URL ||
    process.env.BETTER_AUTH_URL ||
    process.env.DEPLOW_PUBLIC_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "")
  const u = new URL(base)
  const dsn = buildDsn({
    publicKey: row.public_key,
    host: u.host,
    sentryId: row.sentry_id,
    protocol: u.protocol.replace(":", ""),
  })

  console.log(dsn)
  console.error(`# db ${dbPath}`)
  console.error(`# project ${row.project_id}  sentryId=${row.sentry_id}`)
  console.error("# Add to .env:")
  console.error("# DEPLOW_OBSERVE_DOGFOOD=1")
  console.error(`# DEPLOW_OBSERVE_DOGFOOD_DSN=${dsn}`)
  console.error(`# DEPLOW_OBSERVE_DOGFOOD_PROJECT_ID=${row.project_id}`)
}

main()
