/**
 * Idempotent schema bootstrap for git-oauth + services/resource_links tables.
 * Runs on process start so deploys work even if drizzle migrate was skipped.
 */
import type Database from "better-sqlite3"

const SERVICES_CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS services (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    type text NOT NULL DEFAULT 'web',
    is_primary integer NOT NULL DEFAULT 0,
    container_port integer NOT NULL DEFAULT 80,
    status text NOT NULL DEFAULT 'ready',
    git_provider text,
    git_repo_url text,
    git_branch text DEFAULT 'main',
    git_webhook_secret_encrypted text,
    git_connected_at integer,
    git_last_delivery_at integer,
    git_last_delivery_status text,
    git_last_delivery_error text,
    git_auth_method text,
    git_installation_id text,
    git_access_token_encrypted text,
    git_remote_webhook_id text,
    git_repo_full_name text,
    build_strategy_override text,
    dockerfile_path text,
    env_json text,
    public_url text,
    container_id text,
    image text,
    error_message text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS services_project_idx ON services (project_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS services_project_name_idx ON services (project_id, name)`,
  `CREATE TABLE IF NOT EXISTS resource_links (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    kind text NOT NULL,
    source text NOT NULL DEFAULT 'shared-instance',
    status text NOT NULL DEFAULT 'provisioning',
    credentials_encrypted text,
    error_message text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS resource_links_project_idx ON resource_links (project_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS resource_links_project_kind_idx ON resource_links (project_id, kind)`,
]

const DEPLOYMENTS_SERVICE_COLUMN: Array<{ name: string; sql: string }> = [
  {
    name: "service_id",
    sql: "ALTER TABLE deployments ADD COLUMN service_id text REFERENCES services(id) ON DELETE cascade",
  },
]

const BACKUPS_RESOURCE_LINK_COLUMN: Array<{ name: string; sql: string }> = [
  {
    name: "resource_link_id",
    sql: "ALTER TABLE backups ADD COLUMN resource_link_id text REFERENCES resource_links(id) ON DELETE cascade",
  },
]

const GIT_OAUTH_CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS git_provider_links (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    provider text NOT NULL,
    provider_user_id text,
    login text,
    avatar_url text,
    access_token_encrypted text,
    refresh_token_encrypted text,
    expires_at integer,
    github_installation_id text,
    scopes text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS git_provider_links_user_idx ON git_provider_links (user_id)`,
  `CREATE INDEX IF NOT EXISTS git_provider_links_user_provider_idx ON git_provider_links (user_id, provider)`,
  `CREATE TABLE IF NOT EXISTS github_app_installations (
    installation_id text PRIMARY KEY NOT NULL,
    account_login text NOT NULL,
    account_type text DEFAULT 'User' NOT NULL,
    linked_user_id text,
    suspended_at integer,
    created_at integer NOT NULL,
    updated_at integer NOT NULL,
    FOREIGN KEY (linked_user_id) REFERENCES user(id) ON DELETE set null
  )`,
  `CREATE INDEX IF NOT EXISTS github_app_installations_user_idx ON github_app_installations (linked_user_id)`,
  `CREATE TABLE IF NOT EXISTS platform_integrations (
    provider text PRIMARY KEY NOT NULL,
    config_encrypted text NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_states (
    state text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    provider text NOT NULL,
    return_to text,
    expires_at integer NOT NULL,
    created_at integer NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE cascade
  )`,
]

function tableColumns(sqlite: Database.Database, table: string): Set<string> {
  try {
    const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string
    }>
    return new Set(rows.map((r) => r.name))
  } catch {
    return new Set()
  }
}

/**
 * Ensure git OAuth schema exists. Safe to call multiple times.
 */
export function ensureGitOAuthSchema(sqlite: Database.Database): void {
  for (const sql of GIT_OAUTH_CREATE_STATEMENTS) {
    try {
      sqlite.exec(sql)
    } catch {
      // ignore if race
    }
  }
}

/**
 * Ensure services + resource_links tables exist, and deployments/backups
 * have the new FK columns. Safe to call multiple times.
 */
export function ensureServicesSchema(sqlite: Database.Database): void {
  for (const sql of SERVICES_CREATE_STATEMENTS) {
    try {
      sqlite.exec(sql)
    } catch {
      // ignore if race
    }
  }

  const deployCols = tableColumns(sqlite, "deployments")
  if (deployCols.size > 0) {
    for (const col of DEPLOYMENTS_SERVICE_COLUMN) {
      if (!deployCols.has(col.name)) {
        try {
          sqlite.exec(col.sql)
        } catch {
          // column race / already exists
        }
      }
    }
  }

  const backupCols = tableColumns(sqlite, "backups")
  if (backupCols.size > 0) {
    for (const col of BACKUPS_RESOURCE_LINK_COLUMN) {
      if (!backupCols.has(col.name)) {
        try {
          sqlite.exec(col.sql)
        } catch {
          // column race / already exists
        }
      }
    }
  }
}
