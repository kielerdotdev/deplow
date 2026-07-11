import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"

import { ensureGitOAuthSchema } from "./ensure-schema"

describe("ensureGitOAuthSchema", () => {
  it("creates git oauth tables without mutating projects", () => {
    const sqlite = new Database(":memory:")
    sqlite.exec(`
      CREATE TABLE user (id text PRIMARY KEY);
      CREATE TABLE projects (
        id text PRIMARY KEY,
        name text,
        slug text,
        owner_id text,
        status text,
        created_at integer,
        updated_at integer
      );
    `)
    ensureGitOAuthSchema(sqlite)
    ensureGitOAuthSchema(sqlite) // idempotent

    const tables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)
    expect(names).toContain("git_provider_links")
    expect(names).toContain("github_app_installations")
    expect(names).toContain("platform_integrations")
    expect(names).toContain("oauth_states")

    const cols = sqlite.prepare(`PRAGMA table_info(projects)`).all() as Array<{
      name: string
    }>
    expect(cols.map((c) => c.name)).not.toContain("git_auth_method")
    sqlite.close()
  })
})
