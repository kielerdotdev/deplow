import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"

import { ensureGitOAuthSchema } from "@deplow/db"

describe("ensureGitOAuthSchema (runtime bootstrap)", () => {
  it("is idempotent and adds git oauth schema", () => {
    const sqlite = new Database(":memory:")
    sqlite.exec(`
      CREATE TABLE user (id text PRIMARY KEY);
      CREATE TABLE projects (
        id text PRIMARY KEY,
        name text NOT NULL,
        slug text NOT NULL,
        owner_id text NOT NULL,
        status text NOT NULL DEFAULT 'ready',
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
    `)
    ensureGitOAuthSchema(sqlite)
    ensureGitOAuthSchema(sqlite)

    const tables = (
      sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
        )
        .all() as Array<{ name: string }>
    ).map((t) => t.name)

    expect(tables).toEqual(
      expect.arrayContaining([
        "git_provider_links",
        "github_app_installations",
        "platform_integrations",
        "oauth_states",
      ]),
    )

    // Can insert link row (FK → user)
    const now = Date.now()
    sqlite.prepare(`INSERT INTO user (id) VALUES (?)`).run("u1")
    sqlite
      .prepare(
        `INSERT INTO git_provider_links (id, user_id, provider, login, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("l1", "u1", "github", "alice", now, now)
    const row = sqlite
      .prepare(`SELECT login FROM git_provider_links WHERE id = ?`)
      .get("l1") as { login: string }
    expect(row.login).toBe("alice")
    sqlite.close()
  })
})
