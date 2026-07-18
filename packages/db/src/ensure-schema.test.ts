import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"

import {
  ensureGitOAuthSchema,
  ensureIngressSchema,
  ensureMcpTokensSchema,
  ensureOrganizationsSchema,
} from "./ensure-schema"

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

describe("ensureIngressSchema", () => {
  it("creates platform_ingress and service_hostnames", () => {
    const sqlite = new Database(":memory:")
    sqlite.exec(`
      CREATE TABLE services (
        id text PRIMARY KEY,
        project_id text NOT NULL,
        name text NOT NULL,
        slug text NOT NULL,
        type text NOT NULL,
        status text NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
    `)
    ensureIngressSchema(sqlite)
    ensureIngressSchema(sqlite)

    const tables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)
    expect(names).toContain("platform_ingress")
    expect(names).toContain("service_hostnames")
    expect(names).not.toContain("platform_operator_webhook")
    sqlite.close()
  })
})

describe("ensureMcpTokensSchema", () => {
  it("creates mcp_tokens", () => {
    const sqlite = new Database(":memory:")
    sqlite.exec(`
      CREATE TABLE user (
        id text PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL,
        email_verified integer NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
    `)
    ensureMcpTokensSchema(sqlite)
    ensureMcpTokensSchema(sqlite)

    const tables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )
      .all() as Array<{ name: string }>
    expect(tables.map((t) => t.name)).toContain("mcp_tokens")
    sqlite.close()
  })
})

describe("ensureOrganizationsSchema", () => {
  it("bootstraps personal orgs and marks instance admins", () => {
    const sqlite = new Database(":memory:")
    sqlite.exec(`
      CREATE TABLE user (
        id text PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL,
        email_verified integer NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE TABLE projects (
        id text PRIMARY KEY,
        name text NOT NULL,
        slug text NOT NULL,
        owner_id text NOT NULL,
        status text NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE UNIQUE INDEX projects_name_unique ON projects (name);
      CREATE UNIQUE INDEX projects_slug_unique ON projects (slug);
      INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
      VALUES ('u1', 'Ada', 'ada@example.com', 1, 1, 1);
      INSERT INTO projects (id, name, slug, owner_id, status, created_at, updated_at)
      VALUES ('p1', 'demo', 'demo', 'u1', 'ready', 1, 1);
    `)
    ensureOrganizationsSchema(sqlite)
    ensureOrganizationsSchema(sqlite)

    const tables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)
    expect(names).toContain("organizations")
    expect(names).toContain("organization_members")
    expect(names).toContain("organization_invites")

    const userCols = sqlite.prepare(`PRAGMA table_info(user)`).all() as Array<{
      name: string
    }>
    expect(userCols.map((c) => c.name)).toContain("instance_admin")

    const admin = sqlite
      .prepare(`SELECT instance_admin FROM user WHERE id = 'u1'`)
      .get() as { instance_admin: number }
    expect(admin.instance_admin).toBe(1)

    const project = sqlite
      .prepare(`SELECT organization_id FROM projects WHERE id = 'p1'`)
      .get() as { organization_id: string }
    expect(project.organization_id).toBeTruthy()

    const members = sqlite
      .prepare(`SELECT role FROM organization_members WHERE user_id = 'u1'`)
      .all() as Array<{ role: string }>
    expect(members).toHaveLength(1)
    expect(members[0]!.role).toBe("owner")
    sqlite.close()
  })
})
