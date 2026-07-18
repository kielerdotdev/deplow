import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"

import { ensureAgentNodesSchema } from "./ensure-schema"

describe("ensureAgentNodesSchema", () => {
  it("is idempotent and creates agent tables", () => {
    const sqlite = new Database(":memory:")
    sqlite.exec(`
      CREATE TABLE nodes (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL UNIQUE,
        provider text NOT NULL DEFAULT 'docker',
        host text NOT NULL,
        port integer NOT NULL DEFAULT 22,
        status text NOT NULL DEFAULT 'unknown',
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE TABLE operations (
        id text PRIMARY KEY NOT NULL
      );
      CREATE TABLE user (
        id text PRIMARY KEY NOT NULL
      );
    `)
    ensureAgentNodesSchema(sqlite)
    ensureAgentNodesSchema(sqlite)

    const cols = sqlite
      .prepare(`PRAGMA table_info(nodes)`)
      .all() as Array<{ name: string }>
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "agent_token_hash",
        "advertise_host",
        "agent_version",
        "capabilities_json",
        "mesh_provider",
        "mesh_status",
        "local_proxy_ready",
      ]),
    )

    const tables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)
    expect(names).toContain("node_join_tokens")
    expect(names).toContain("node_jobs")
  })
})
