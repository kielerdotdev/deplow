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
    root_directory text,
    build_command text,
    start_command text,
    health_check_path text,
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
    source text NOT NULL DEFAULT 'dedicated-container',
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

const SERVICES_BUILD_COLUMNS: Array<{ name: string; sql: string }> = [
  {
    name: "root_directory",
    sql: "ALTER TABLE services ADD COLUMN root_directory text",
  },
  {
    name: "build_command",
    sql: "ALTER TABLE services ADD COLUMN build_command text",
  },
  {
    name: "start_command",
    sql: "ALTER TABLE services ADD COLUMN start_command text",
  },
  {
    name: "health_check_path",
    sql: "ALTER TABLE services ADD COLUMN health_check_path text",
  },
  {
    name: "build_strategy_override",
    sql: "ALTER TABLE services ADD COLUMN build_strategy_override text",
  },
  {
    name: "dockerfile_path",
    sql: "ALTER TABLE services ADD COLUMN dockerfile_path text",
  },
]

const BACKUPS_RESOURCE_LINK_COLUMN: Array<{ name: string; sql: string }> = [
  {
    name: "resource_link_id",
    sql: "ALTER TABLE backups ADD COLUMN resource_link_id text REFERENCES resource_links(id) ON DELETE cascade",
  },
  {
    name: "target_at",
    sql: "ALTER TABLE backups ADD COLUMN target_at text",
  },
  {
    name: "service_id",
    sql: "ALTER TABLE backups ADD COLUMN service_id text REFERENCES services(id) ON DELETE cascade",
  },
]

const SERVICES_EXTRA_COLUMNS: Array<{ name: string; sql: string }> = [
  {
    name: "credentials_encrypted",
    sql: "ALTER TABLE services ADD COLUMN credentials_encrypted text",
  },
  {
    name: "legacy_resource_link_id",
    sql: "ALTER TABLE services ADD COLUMN legacy_resource_link_id text",
  },
  {
    name: "last_operation_id",
    sql: "ALTER TABLE services ADD COLUMN last_operation_id text",
  },
  {
    name: "error_code",
    sql: "ALTER TABLE services ADD COLUMN error_code text",
  },
  {
    name: "git_watch_paths",
    sql: "ALTER TABLE services ADD COLUMN git_watch_paths text",
  },
]

const PROJECTS_EXTRA_COLUMNS: Array<{ name: string; sql: string }> = [
  {
    name: "storage_credentials_encrypted",
    sql: "ALTER TABLE projects ADD COLUMN storage_credentials_encrypted text",
  },
  {
    name: "bindings_migrated_at",
    sql: "ALTER TABLE projects ADD COLUMN bindings_migrated_at integer",
  },
  {
    name: "project_secrets_encrypted",
    sql: "ALTER TABLE projects ADD COLUMN project_secrets_encrypted text",
  },
]

const DEPLOYMENTS_EXTRA_COLUMNS: Array<{ name: string; sql: string }> = [
  {
    name: "operation_id",
    sql: "ALTER TABLE deployments ADD COLUMN operation_id text REFERENCES operations(id) ON DELETE set null",
  },
  {
    name: "git_sha",
    sql: "ALTER TABLE deployments ADD COLUMN git_sha text",
  },
  {
    name: "git_branch",
    sql: "ALTER TABLE deployments ADD COLUMN git_branch text",
  },
  {
    name: "failed_stage",
    sql: "ALTER TABLE deployments ADD COLUMN failed_stage text",
  },
]

const OPERATIONS_CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS operations (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    service_id text,
    type text NOT NULL,
    status text NOT NULL DEFAULT 'created',
    stage text,
    idempotency_key text,
    triggered_by text DEFAULT 'manual',
    input_json text,
    result_json text,
    error_message text,
    error_code text,
    root_cause text,
    symptom text,
    logs_text text,
    attempts integer NOT NULL DEFAULT 0,
    created_at integer NOT NULL,
    started_at integer,
    finished_at integer,
    updated_at integer NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE set null
  )`,
  `CREATE INDEX IF NOT EXISTS operations_project_idx ON operations (project_id)`,
  `CREATE INDEX IF NOT EXISTS operations_service_idx ON operations (service_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS operations_idempotency_idx ON operations (idempotency_key)`,
  `CREATE TABLE IF NOT EXISTS service_bindings (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    consumer_service_id text NOT NULL,
    provider_service_id text NOT NULL,
    env_key text NOT NULL,
    principal text,
    created_at integer NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
    FOREIGN KEY (consumer_service_id) REFERENCES services(id) ON DELETE cascade,
    FOREIGN KEY (provider_service_id) REFERENCES services(id) ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS service_bindings_project_idx ON service_bindings (project_id)`,
  `CREATE INDEX IF NOT EXISTS service_bindings_consumer_idx ON service_bindings (consumer_service_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS service_bindings_consumer_env_idx ON service_bindings (consumer_service_id, env_key)`,
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

const INGRESS_CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS platform_ingress (
    id text PRIMARY KEY NOT NULL DEFAULT 'default',
    base_domain text DEFAULT '' NOT NULL,
    public_protocol text DEFAULT 'https' NOT NULL,
    auto_domains_enabled integer DEFAULT 1 NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS service_hostnames (
    id text PRIMARY KEY NOT NULL,
    service_id text NOT NULL,
    hostname text NOT NULL,
    kind text NOT NULL,
    is_primary integer DEFAULT 0 NOT NULL,
    preview_key text,
    status text DEFAULT 'active' NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS service_hostnames_hostname_idx ON service_hostnames (hostname)`,
  `CREATE INDEX IF NOT EXISTS service_hostnames_service_idx ON service_hostnames (service_id)`,
  `CREATE TABLE IF NOT EXISTS platform_operator_webhook (
    id text PRIMARY KEY NOT NULL DEFAULT 'default',
    enabled integer DEFAULT 0 NOT NULL,
    url text DEFAULT '' NOT NULL,
    secret_encrypted text,
    on_failure integer DEFAULT 1 NOT NULL,
    on_success integer DEFAULT 0 NOT NULL,
    updated_at integer NOT NULL
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
 * Ensure platform ingress + service_hostnames tables exist.
 * Safe to call multiple times. Call after services table exists.
 */
export function ensureIngressSchema(sqlite: Database.Database): void {
  for (const sql of INGRESS_CREATE_STATEMENTS) {
    try {
      sqlite.exec(sql)
    } catch {
      // ignore if race
    }
  }
}

const MCP_TOKENS_CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS mcp_tokens (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    prefix text NOT NULL,
    created_at integer NOT NULL,
    last_used_at integer,
    revoked_at integer,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS mcp_tokens_user_idx ON mcp_tokens (user_id)`,
  `CREATE INDEX IF NOT EXISTS mcp_tokens_hash_idx ON mcp_tokens (token_hash)`,
]

/** Ensure mcp_tokens table exists. Safe to call multiple times. */
export function ensureMcpTokensSchema(sqlite: Database.Database): void {
  for (const sql of MCP_TOKENS_CREATE_STATEMENTS) {
    try {
      sqlite.exec(sql)
    } catch {
      // ignore if race
    }
  }
}

const ORGANIZATIONS_CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS organizations (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_idx ON organizations (slug)`,
  `CREATE TABLE IF NOT EXISTS organization_members (
    id text PRIMARY KEY NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL DEFAULT 'member',
    created_at integer NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE cascade,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS organization_members_org_user_idx ON organization_members (organization_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS organization_members_user_idx ON organization_members (user_id)`,
  `CREATE INDEX IF NOT EXISTS organization_members_org_idx ON organization_members (organization_id)`,
  `CREATE TABLE IF NOT EXISTS organization_invites (
    id text PRIMARY KEY NOT NULL,
    organization_id text NOT NULL,
    email text NOT NULL,
    role text NOT NULL DEFAULT 'member',
    token_hash text NOT NULL UNIQUE,
    invited_by_user_id text NOT NULL,
    expires_at integer NOT NULL,
    accepted_at integer,
    created_at integer NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE cascade,
    FOREIGN KEY (invited_by_user_id) REFERENCES user(id) ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS organization_invites_org_idx ON organization_invites (organization_id)`,
  `CREATE INDEX IF NOT EXISTS organization_invites_email_idx ON organization_invites (email)`,
]

function slugifyOrg(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return base || "org"
}

/**
 * Ensure organizations schema + bootstrap personal orgs for existing users.
 * Safe to call multiple times.
 */
export function ensureOrganizationsSchema(sqlite: Database.Database): void {
  const userCols = tableColumns(sqlite, "user")
  if (userCols.size > 0 && !userCols.has("instance_admin")) {
    try {
      sqlite.exec(
        `ALTER TABLE user ADD COLUMN instance_admin integer NOT NULL DEFAULT 0`,
      )
    } catch {
      // ignore
    }
  }

  for (const sql of ORGANIZATIONS_CREATE_STATEMENTS) {
    try {
      sqlite.exec(sql)
    } catch {
      // ignore if race
    }
  }

  const projectCols = tableColumns(sqlite, "projects")
  if (projectCols.size > 0 && !projectCols.has("organization_id")) {
    try {
      sqlite.exec(
        `ALTER TABLE projects ADD COLUMN organization_id text REFERENCES organizations(id) ON DELETE cascade`,
      )
    } catch {
      // ignore
    }
  }

  bootstrapOrganizations(sqlite)

  try {
    sqlite.exec(`DROP INDEX IF EXISTS projects_name_unique`)
    sqlite.exec(`DROP INDEX IF EXISTS projects_slug_unique`)
    sqlite.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS projects_org_name_idx ON projects (organization_id, name)`,
    )
    sqlite.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS projects_org_slug_idx ON projects (organization_id, slug)`,
    )
    sqlite.exec(
      `CREATE INDEX IF NOT EXISTS projects_org_idx ON projects (organization_id)`,
    )
  } catch {
    // index may fail if null organization_ids remain
  }
}

function bootstrapOrganizations(sqlite: Database.Database): void {
  try {
    const users = sqlite
      .prepare(
        `SELECT id, name, email, created_at FROM user ORDER BY created_at ASC`,
      )
      .all() as Array<{
      id: string
      name: string
      email: string
      created_at: number
    }>

    if (users.length === 0) return

    const now = Date.now()
    const hasMembership = sqlite.prepare(
      `SELECT id FROM organization_members WHERE user_id = ? LIMIT 1`,
    )
    const insertOrg = sqlite.prepare(
      `INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    )
    const insertMember = sqlite.prepare(
      `INSERT OR IGNORE INTO organization_members (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`,
    )
    const slugTaken = sqlite.prepare(
      `SELECT id FROM organizations WHERE slug = ? LIMIT 1`,
    )
    const updateProject = sqlite.prepare(
      `UPDATE projects SET organization_id = ? WHERE owner_id = ? AND organization_id IS NULL`,
    )
    const setAdmin = sqlite.prepare(
      `UPDATE user SET instance_admin = 1 WHERE id = ?`,
    )

    const adminCount = sqlite
      .prepare(`SELECT COUNT(*) as c FROM user WHERE instance_admin = 1`)
      .get() as { c: number }
    if (adminCount.c === 0) {
      // Existing installs: mark all current users as instance admin once
      for (const u of users) {
        setAdmin.run(u.id)
      }
    }

    for (const u of users) {
      const existing = hasMembership.get(u.id) as { id: string } | undefined
      if (existing) {
        updateProject.run(
          (
            sqlite
              .prepare(
                `SELECT organization_id FROM organization_members WHERE user_id = ? LIMIT 1`,
              )
              .get(u.id) as { organization_id: string }
          ).organization_id,
          u.id,
        )
        continue
      }

      let slug = slugifyOrg(u.name || u.email.split("@")[0] || "org")
      if (slugTaken.get(slug)) {
        slug = `${slug}-${u.id.slice(0, 8)}`
      }
      const orgId = crypto.randomUUID()
      const name = u.name?.trim() || u.email.split("@")[0] || "Personal"
      insertOrg.run(orgId, name, slug, now, now)
      insertMember.run(crypto.randomUUID(), orgId, u.id, now)
      updateProject.run(orgId, u.id)
    }
  } catch {
    // bootstrap best-effort
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

  for (const sql of OPERATIONS_CREATE_STATEMENTS) {
    try {
      sqlite.exec(sql)
    } catch {
      // ignore if race
    }
  }

  const serviceCols = tableColumns(sqlite, "services")
  if (serviceCols.size > 0) {
    for (const col of [...SERVICES_BUILD_COLUMNS, ...SERVICES_EXTRA_COLUMNS]) {
      if (!serviceCols.has(col.name)) {
        try {
          sqlite.exec(col.sql)
        } catch {
          // column race / already exists
        }
      }
    }
    // Migrate legacy ready → stopped when no container
    try {
      sqlite.exec(
        `UPDATE services SET status = 'stopped' WHERE status = 'ready' AND container_id IS NULL`,
      )
      sqlite.exec(
        `UPDATE services SET status = 'running' WHERE status = 'ready' AND container_id IS NOT NULL`,
      )
    } catch {
      // ignore
    }
  }

  const projectCols = tableColumns(sqlite, "projects")
  if (projectCols.size > 0) {
    for (const col of PROJECTS_EXTRA_COLUMNS) {
      if (!projectCols.has(col.name)) {
        try {
          sqlite.exec(col.sql)
        } catch {
          // ignore
        }
      }
    }
  }

  const deployCols = tableColumns(sqlite, "deployments")
  if (deployCols.size > 0) {
    for (const col of [
      ...DEPLOYMENTS_SERVICE_COLUMN,
      ...DEPLOYMENTS_EXTRA_COLUMNS,
    ]) {
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

  // Allow multiple postgres/redis per project (drop kind uniqueness)
  try {
    sqlite.exec(`DROP INDEX IF EXISTS resource_links_project_kind_idx`)
  } catch {
    // ignore
  }

  migrateResourceLinksToServices(sqlite)
  ensureIngressSchema(sqlite)
  ensureMcpTokensSchema(sqlite)
  ensureOrganizationsSchema(sqlite)
}

/**
 * Copy postgres/redis resource_links into services rows (idempotent).
 */
function migrateResourceLinksToServices(sqlite: Database.Database): void {
  try {
    const links = sqlite
      .prepare(
        `SELECT id, project_id, kind, status, credentials_encrypted, error_message, created_at, updated_at
         FROM resource_links WHERE kind IN ('postgres', 'redis')`,
      )
      .all() as Array<{
      id: string
      project_id: string
      kind: string
      status: string
      credentials_encrypted: string | null
      error_message: string | null
      created_at: number
      updated_at: number
    }>

    const insert = sqlite.prepare(
      `INSERT OR IGNORE INTO services (
        id, project_id, name, slug, type, is_primary, container_port, status,
        credentials_encrypted, legacy_resource_link_id, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)`,
    )
    const projectSlug = sqlite.prepare(
      `SELECT slug FROM projects WHERE id = ?`,
    )
    const existingByLegacy = sqlite.prepare(
      `SELECT id FROM services WHERE legacy_resource_link_id = ?`,
    )
    const updateBackup = sqlite.prepare(
      `UPDATE backups SET service_id = ? WHERE resource_link_id = ? AND service_id IS NULL`,
    )

    for (const link of links) {
      const already = existingByLegacy.get(link.id) as { id: string } | undefined
      if (already) {
        updateBackup.run(already.id, link.id)
        continue
      }
      const proj = projectSlug.get(link.project_id) as
        | { slug: string }
        | undefined
      if (!proj) continue
      const serviceId = crypto.randomUUID()
      const status =
        link.status === "ready"
          ? "running"
          : link.status === "error"
            ? "error"
            : "provisioning"
      const name = link.kind
      insert.run(
        serviceId,
        link.project_id,
        name,
        `${proj.slug}-${name}`,
        link.kind,
        status,
        link.credentials_encrypted,
        link.id,
        link.error_message,
        link.created_at,
        link.updated_at,
      )
      // Name collision: try kind-shortId
      const check = sqlite
        .prepare(`SELECT id FROM services WHERE id = ?`)
        .get(serviceId) as { id: string } | undefined
      if (!check) {
        const altName = `${link.kind}-${link.id.slice(0, 8)}`
        insert.run(
          serviceId,
          link.project_id,
          altName,
          `${proj.slug}-${altName}`,
          link.kind,
          status,
          link.credentials_encrypted,
          link.id,
          link.error_message,
          link.created_at,
          link.updated_at,
        )
      }
      updateBackup.run(serviceId, link.id)
    }

    // Move s3 credentials onto projects when missing
    const s3Links = sqlite
      .prepare(
        `SELECT project_id, credentials_encrypted FROM resource_links
         WHERE kind = 's3' AND credentials_encrypted IS NOT NULL`,
      )
      .all() as Array<{ project_id: string; credentials_encrypted: string }>
    const updateStorage = sqlite.prepare(
      `UPDATE projects SET storage_credentials_encrypted = ?
       WHERE id = ? AND storage_credentials_encrypted IS NULL`,
    )
    for (const s3 of s3Links) {
      updateStorage.run(s3.credentials_encrypted, s3.project_id)
    }
  } catch {
    // migration best-effort
  }
}

const OBSERVE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS observe_projects (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE cascade,
    sentry_id integer NOT NULL,
    enabled integer NOT NULL DEFAULT 1,
    retention_max_event_count integer NOT NULL DEFAULT 10000,
    retention_max_age_days integer NOT NULL DEFAULT 30,
    span_retention_days integer NOT NULL DEFAULT 7,
    quota_per_5m integer NOT NULL DEFAULT 1000,
    quota_per_hour integer NOT NULL DEFAULT 5000,
    quota_per_month integer NOT NULL DEFAULT 1000000,
    grouping_mechanism text NOT NULL DEFAULT 'deplow-v1',
    digest_counter integer NOT NULL DEFAULT 0,
    stored_event_count integer NOT NULL DEFAULT 0,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS observe_projects_project_idx ON observe_projects (project_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS observe_projects_sentry_id_idx ON observe_projects (sentry_id)`,
  `CREATE TABLE IF NOT EXISTS observe_keys (
    id text PRIMARY KEY NOT NULL,
    observe_project_id text NOT NULL REFERENCES observe_projects(id) ON DELETE cascade,
    public_key text NOT NULL,
    name text NOT NULL DEFAULT 'default',
    revoked_at integer,
    created_at integer NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS observe_keys_public_key_idx ON observe_keys (public_key)`,
  `CREATE INDEX IF NOT EXISTS observe_keys_observe_project_idx ON observe_keys (observe_project_id)`,
  `CREATE TABLE IF NOT EXISTS observe_issues (
    id text PRIMARY KEY NOT NULL,
    observe_project_id text NOT NULL REFERENCES observe_projects(id) ON DELETE cascade,
    title text NOT NULL,
    culprit text NOT NULL DEFAULT '',
    level text NOT NULL DEFAULT 'error',
    status text NOT NULL DEFAULT 'unresolved',
    digested_event_count integer NOT NULL DEFAULT 0,
    first_seen integer NOT NULL,
    last_seen integer NOT NULL,
    last_event_id text,
    last_trace_id text,
    is_deleted integer NOT NULL DEFAULT 0,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS observe_issues_project_idx ON observe_issues (observe_project_id)`,
  `CREATE INDEX IF NOT EXISTS observe_issues_status_idx ON observe_issues (observe_project_id, status)`,
  `CREATE TABLE IF NOT EXISTS observe_groupings (
    id text PRIMARY KEY NOT NULL,
    observe_project_id text NOT NULL REFERENCES observe_projects(id) ON DELETE cascade,
    mechanism text NOT NULL,
    grouping_key text NOT NULL,
    grouping_key_hash text NOT NULL,
    issue_id text NOT NULL REFERENCES observe_issues(id) ON DELETE cascade,
    created_at integer NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS observe_groupings_hash_idx ON observe_groupings (observe_project_id, mechanism, grouping_key_hash)`,
  `CREATE INDEX IF NOT EXISTS observe_groupings_issue_idx ON observe_groupings (issue_id)`,
  `CREATE TABLE IF NOT EXISTS observe_event_counts_hourly (
    id text PRIMARY KEY NOT NULL,
    scope text NOT NULL,
    scope_id text NOT NULL,
    hour text NOT NULL,
    count integer NOT NULL DEFAULT 0
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS observe_event_counts_hourly_uidx ON observe_event_counts_hourly (scope, scope_id, hour)`,
  `CREATE TABLE IF NOT EXISTS observe_members (
    id text PRIMARY KEY NOT NULL,
    observe_project_id text NOT NULL REFERENCES observe_projects(id) ON DELETE cascade,
    user_id text NOT NULL,
    role text NOT NULL DEFAULT 'viewer',
    created_at integer NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS observe_members_uidx ON observe_members (observe_project_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS observe_members_project_idx ON observe_members (observe_project_id)`,
  `CREATE TABLE IF NOT EXISTS observe_saved_views (
    id text PRIMARY KEY NOT NULL,
    observe_project_id text NOT NULL REFERENCES observe_projects(id) ON DELETE cascade,
    name text NOT NULL,
    surface text NOT NULL DEFAULT 'explore',
    context_json text NOT NULL,
    created_by text,
    created_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS observe_saved_views_project_idx ON observe_saved_views (observe_project_id)`,
  `CREATE TABLE IF NOT EXISTS observe_insights (
    id text PRIMARY KEY NOT NULL,
    observe_project_id text NOT NULL REFERENCES observe_projects(id) ON DELETE cascade,
    name text NOT NULL,
    description text,
    spec_json text NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS observe_insights_project_idx ON observe_insights (observe_project_id)`,
  `CREATE TABLE IF NOT EXISTS observe_dashboards (
    id text PRIMARY KEY NOT NULL,
    observe_project_id text NOT NULL REFERENCES observe_projects(id) ON DELETE cascade,
    name text NOT NULL,
    template text NOT NULL DEFAULT 'blank',
    layout_json text NOT NULL DEFAULT '{"widgets":[]}',
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS observe_dashboards_project_idx ON observe_dashboards (observe_project_id)`,
  `CREATE TABLE IF NOT EXISTS observe_alerts (
    id text PRIMARY KEY NOT NULL,
    observe_project_id text NOT NULL REFERENCES observe_projects(id) ON DELETE cascade,
    name text NOT NULL,
    enabled integer NOT NULL DEFAULT 1,
    kind text NOT NULL DEFAULT 'threshold',
    metric text NOT NULL DEFAULT 'error_rate',
    operator text NOT NULL DEFAULT 'gt',
    threshold text NOT NULL DEFAULT '0.05',
    window text NOT NULL DEFAULT '5m',
    context_json text NOT NULL DEFAULT '{}',
    channel_email text,
    channel_webhook text,
    last_triggered_at integer,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS observe_alerts_project_idx ON observe_alerts (observe_project_id)`,
  `CREATE TABLE IF NOT EXISTS message_channels (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    config_json text NOT NULL DEFAULT '{}',
    enabled integer NOT NULL DEFAULT 1,
    created_by text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  // Additive column for alerts → channel ids (JSON array)
  `ALTER TABLE observe_alerts ADD COLUMN channel_ids_json text NOT NULL DEFAULT '[]'`,
]

export function ensureObserveSchema(sqlite: Database.Database): void {
  for (const sql of OBSERVE_STATEMENTS) {
    try {
      sqlite.exec(sql)
    } catch (err) {
      // SQLite: duplicate column on re-run of ALTER TABLE
      const msg = err instanceof Error ? err.message : String(err)
      if (!/duplicate column/i.test(msg)) throw err
    }
  }
}
