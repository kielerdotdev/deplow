import { relations } from "drizzle-orm"
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import { user } from "./auth-schema"

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Node that owns app + data plane for this project (v1 = local Docker).
     * Every project is pinned even with a single node.
     */
    nodeId: text("node_id").references(() => nodes.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: ["provisioning", "ready", "error", "destroying"],
    })
      .notNull()
      .default("provisioning"),
    errorMessage: text("error_message"),
    /** Backup interval in ms (default daily); scheduler reads this */
    backupIntervalMs: integer("backup_interval_ms")
      .notNull()
      .default(86_400_000),
    lastBackupAt: integer("last_backup_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("projects_owner_idx").on(t.ownerId),
    index("projects_node_idx").on(t.nodeId),
  ],
)

/**
 * A service is an independently deployable unit within a project.
 * Each service has its own git repo, build config, env, and lifecycle.
 * Resources (Postgres, Redis, S3) are linked to the project and shared
 * across all services.
 */
export const services = sqliteTable(
  "services",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** "api", "web", "worker" — unique within the project */
    name: text("name").notNull(),
    /** Derived slug for container naming + proxy hostname */
    slug: text("slug").notNull(),
    /** web = gets a URL + HTTP port; worker = no URL, no port */
    type: text("type", { enum: ["web", "worker"] })
      .notNull()
      .default("web"),
    /** Primary web service gets bare {projectSlug}.{baseDomain} */
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    containerPort: integer("container_port").notNull().default(80),
    status: text("status", {
      enum: ["ready", "deploying", "running", "stopped", "error"],
    })
      .notNull()
      .default("ready"),
    /** Per-service git (null = not connected) */
    gitProvider: text("git_provider"),
    gitRepoUrl: text("git_repo_url"),
    gitBranch: text("git_branch").default("main"),
    gitWebhookSecretEncrypted: text("git_webhook_secret_encrypted"),
    gitConnectedAt: integer("git_connected_at", { mode: "timestamp_ms" }),
    gitLastDeliveryAt: integer("git_last_delivery_at", {
      mode: "timestamp_ms",
    }),
    gitLastDeliveryStatus: text("git_last_delivery_status"),
    gitLastDeliveryError: text("git_last_delivery_error"),
    gitAuthMethod: text("git_auth_method"),
    gitInstallationId: text("git_installation_id"),
    gitAccessTokenEncrypted: text("git_access_token_encrypted"),
    gitRemoteWebhookId: text("git_remote_webhook_id"),
    gitRepoFullName: text("git_repo_full_name"),
    /** Build config overrides (null = auto-detect) */
    buildStrategyOverride: text("build_strategy_override"),
    dockerfilePath: text("dockerfile_path"),
    /** JSON object of service-specific env vars */
    envJson: text("env_json"),
    /** Denormalized runtime state for quick display */
    publicUrl: text("public_url"),
    containerId: text("container_id"),
    image: text("image"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("services_project_idx").on(t.projectId),
    uniqueIndex("services_project_name_idx").on(t.projectId, t.name),
  ],
)

/**
 * A resource link connects a resource (Postgres, Redis, S3, etc.) to a project.
 * Resources are linked to the project, not owned — shared across all services.
 * v1 only supports `shared-instance` (logical tenancy on shared platform instances).
 */
export const resourceLinks = sqliteTable(
  "resource_links",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** postgres | redis | s3 | mongo | mysql | ... */
    kind: text("kind", {
      enum: ["postgres", "redis", "s3", "mongo", "mysql"],
    }).notNull(),
    /** shared-instance (v1) | dedicated-container (v2) | external (v2) */
    source: text("source", {
      enum: ["shared-instance", "dedicated-container", "external"],
    })
      .notNull()
      .default("shared-instance"),
    status: text("status", {
      enum: ["provisioning", "ready", "error"],
    })
      .notNull()
      .default("provisioning"),
    credentialsEncrypted: text("credentials_encrypted"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("resource_links_project_idx").on(t.projectId),
    uniqueIndex("resource_links_project_kind_idx").on(t.projectId, t.kind),
  ],
)

export const nodes = sqliteTable(
  "nodes",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    provider: text("provider", {
      enum: ["docker", "ssh", "hetzner"],
    })
      .notNull()
      .default("docker"),
    /** Host for SSH, or "local" for docker socket */
    host: text("host").notNull(),
    port: integer("port").notNull().default(22),
    username: text("username"),
    /** AES-GCM encrypted private key or empty for local docker */
    sshKeyEncrypted: text("ssh_key_encrypted"),
    labelsJson: text("labels_json"),
    status: text("status", {
      enum: ["online", "offline", "unknown"],
    })
      .notNull()
      .default("unknown"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("nodes_provider_idx").on(t.provider)],
)

export const deployments = sqliteTable(
  "deployments",
  {
    id: text("id").primaryKey(),
    /** Service this deployment belongs to */
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    /** Kept for query convenience (denormalized from service.projectId) */
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    /** Service name snapshot (from service.name at deploy time) */
    serviceName: text("service_name").notNull(),
    image: text("image"),
    dockerCompose: text("docker_compose"),
    /** dockerfile | railpack | image */
    buildStrategy: text("build_strategy"),
    buildLogs: text("build_logs"),
    sourcePath: text("source_path"),
    /**
     * Living deploy status machine:
     * queued → building → deploying → running | failed
     * (pending kept as synonym for queued for older rows)
     */
    status: text("status", {
      enum: [
        "pending",
        "queued",
        "building",
        "deploying",
        "running",
        "failed",
        "stopped",
      ],
    })
      .notNull()
      .default("queued"),
    containerId: text("container_id"),
    errorMessage: text("error_message"),
    /** git_webhook | manual | retry | rollback */
    triggeredBy: text("triggered_by").default("manual"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("deployments_service_idx").on(t.serviceId),
    index("deployments_project_idx").on(t.projectId),
    index("deployments_node_idx").on(t.nodeId),
  ],
)

export const backups = sqliteTable(
  "backups",
  {
    id: text("id").primaryKey(),
    /** Kept for query convenience */
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Resource link being backed up (the Postgres link) */
    resourceLinkId: text("resource_link_id").references(
      () => resourceLinks.id,
      {
        onDelete: "cascade",
      },
    ),
    kind: text("kind", { enum: ["postgres"] })
      .notNull()
      .default("postgres"),
    storageKey: text("storage_key").notNull(),
    sizeBytes: integer("size_bytes"),
    status: text("status", {
      enum: ["running", "completed", "failed"],
    })
      .notNull()
      .default("running"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    index("backups_project_idx").on(t.projectId),
    index("backups_resource_link_idx").on(t.resourceLinkId),
  ],
)

export const spawnedServers = sqliteTable("spawned_servers", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  externalId: text("external_id"),
  ip: text("ip"),
  status: text("status", {
    enum: ["starting", "running", "stopped"],
  })
    .notNull()
    .default("starting"),
  metadataJson: text("metadata_json"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
})

/**
 * Per-user git provider identity (GitHub App OAuth / GitLab OAuth).
 * Tokens encrypted with DEPLOW_SECRETS_KEY — never returned to clients.
 */
export const gitProviderLinks = sqliteTable(
  "git_provider_links",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["github", "gitlab"] }).notNull(),
    providerUserId: text("provider_user_id"),
    login: text("login"),
    avatarUrl: text("avatar_url"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    githubInstallationId: text("github_installation_id"),
    scopes: text("scopes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("git_provider_links_user_idx").on(t.userId),
    index("git_provider_links_user_provider_idx").on(t.userId, t.provider),
  ],
)

/** Cached GitHub App installations linked to a user. */
export const githubAppInstallations = sqliteTable(
  "github_app_installations",
  {
    installationId: text("installation_id").primaryKey(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull().default("User"),
    linkedUserId: text("linked_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    suspendedAt: integer("suspended_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("github_app_installations_user_idx").on(t.linkedUserId)],
)

/**
 * Encrypted platform integration config (GitHub App PEMs, GitLab OAuth clients).
 * One row per provider key: github_app | gitlab_oauth
 */
export const platformIntegrations = sqliteTable("platform_integrations", {
  provider: text("provider").primaryKey(),
  configEncrypted: text("config_encrypted").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
})

/** Short-lived OAuth CSRF state (cleaned on use / expiry). */
export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  returnTo: text("return_to"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
})

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(user, {
    fields: [projects.ownerId],
    references: [user.id],
  }),
  node: one(nodes, {
    fields: [projects.nodeId],
    references: [nodes.id],
  }),
  services: many(services),
  resourceLinks: many(resourceLinks),
  deployments: many(deployments),
  backups: many(backups),
}))

export const servicesRelations = relations(services, ({ one, many }) => ({
  project: one(projects, {
    fields: [services.projectId],
    references: [projects.id],
  }),
  deployments: many(deployments),
}))

export const resourceLinksRelations = relations(
  resourceLinks,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [resourceLinks.projectId],
      references: [projects.id],
    }),
    backups: many(backups),
  }),
)

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  service: one(services, {
    fields: [deployments.serviceId],
    references: [services.id],
  }),
  project: one(projects, {
    fields: [deployments.projectId],
    references: [projects.id],
  }),
  node: one(nodes, {
    fields: [deployments.nodeId],
    references: [nodes.id],
  }),
}))

export const backupsRelations = relations(backups, ({ one }) => ({
  project: one(projects, {
    fields: [backups.projectId],
    references: [projects.id],
  }),
  resourceLink: one(resourceLinks, {
    fields: [backups.resourceLinkId],
    references: [resourceLinks.id],
  }),
}))
