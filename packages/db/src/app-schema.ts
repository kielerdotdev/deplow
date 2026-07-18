import { relations } from "drizzle-orm"
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import { user } from "./auth-schema"

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** Optional icon URL (HTTPS) or data URL for the organization avatar. */
    iconUrl: text("icon_url"),
    /** IANA timezone used as the org default (e.g. Europe/Berlin). */
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("organizations_slug_idx").on(t.slug)],
)

export const organizationMembers = sqliteTable(
  "organization_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("member"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("organization_members_org_user_idx").on(
      t.organizationId,
      t.userId,
    ),
    index("organization_members_user_idx").on(t.userId),
    index("organization_members_org_idx").on(t.organizationId),
  ],
)

export const organizationInvites = sqliteTable(
  "organization_invites",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("member"),
    /** SHA-256 hex of the invite token */
    tokenHash: text("token_hash").notNull().unique(),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    index("organization_invites_org_idx").on(t.organizationId),
    index("organization_invites_email_idx").on(t.email),
  ],
)

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Created-by user (audit); ACL is org membership */
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
    /**
     * @deprecated Prefer resource_links.credentials_encrypted.
     * Kept so pre-migration projects can still decrypt for backup/inject.
     */
    credentialsEncrypted: text("credentials_encrypted"),
    errorMessage: text("error_message"),
    /** Backup interval in ms (default daily); scheduler reads this */
    backupIntervalMs: integer("backup_interval_ms")
      .notNull()
      .default(86_400_000),
    lastBackupAt: integer("last_backup_at", { mode: "timestamp_ms" }),
    /** Lazy-provisioned S3 bucket credentials (MinIO/R2 adapter; not a user-facing service) */
    storageCredentialsEncrypted: text("storage_credentials_encrypted"),
    /** User-managed project env secrets (encrypted JSON object) */
    projectSecretsEncrypted: text("project_secrets_encrypted"),
    bindingsMigratedAt: integer("bindings_migrated_at", {
      mode: "timestamp_ms",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("projects_org_name_idx").on(t.organizationId, t.name),
    uniqueIndex("projects_org_slug_idx").on(t.organizationId, t.slug),
    index("projects_owner_idx").on(t.ownerId),
    index("projects_org_idx").on(t.organizationId),
    index("projects_node_idx").on(t.nodeId),
  ],
)

/**
 * A service is the primary durable operational unit within a project.
 * Types: web/worker (apps) and postgres/redis (data). S3 stays project infra.
 */
export const services = sqliteTable(
  "services",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Unique within the project */
    name: text("name").notNull(),
    /** Derived slug for container naming + proxy hostname */
    slug: text("slug").notNull(),
    /** web | worker | postgres | redis */
    type: text("type", { enum: ["web", "worker", "postgres", "redis"] })
      .notNull()
      .default("web"),
    /** Primary web service gets bare {projectSlug}.{baseDomain} */
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    containerPort: integer("container_port").notNull().default(80),
    status: text("status", {
      enum: [
        "queued",
        "provisioning",
        "deploying",
        "running",
        "stopped",
        "error",
        "destroying",
        /** @deprecated migrated to stopped/running */
        "ready",
      ],
    })
      .notNull()
      .default("queued"),
    /** Per-service git (null = not connected); app services only */
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
    /** JSON array of micromatch globs; null/empty = deploy on any path */
    gitWatchPaths: text("git_watch_paths"),
    /** Build config overrides (null = auto-detect) */
    buildStrategyOverride: text("build_strategy_override"),
    dockerfilePath: text("dockerfile_path"),
    rootDirectory: text("root_directory"),
    buildCommand: text("build_command"),
    startCommand: text("start_command"),
    healthCheckPath: text("health_check_path"),
    /** JSON object of service-specific env vars */
    envJson: text("env_json"),
    /** Encrypted credentials for data services (postgres/redis) */
    credentialsEncrypted: text("credentials_encrypted"),
    /** Migration bridge from resource_links */
    legacyResourceLinkId: text("legacy_resource_link_id"),
    lastOperationId: text("last_operation_id"),
    /** Denormalized runtime state for quick display */
    publicUrl: text("public_url"),
    containerId: text("container_id"),
    image: text("image"),
    errorMessage: text("error_message"),
    errorCode: text("error_code"),
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
 * Long-running work tracked in SQLite; BullMQ executes the jobs.
 */
export const operations = sqliteTable(
  "operations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    serviceId: text("service_id").references(() => services.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: [
        "deploy",
        "provision",
        "backup",
        "restore",
        "pitr_restore",
        "destroy",
      ],
    }).notNull(),
    status: text("status", {
      enum: [
        "created",
        "queued",
        "running",
        "succeeded",
        "failed",
        "cancelled",
      ],
    })
      .notNull()
      .default("created"),
    stage: text("stage"),
    idempotencyKey: text("idempotency_key"),
    triggeredBy: text("triggered_by").default("manual"),
    inputJson: text("input_json"),
    resultJson: text("result_json"),
    errorMessage: text("error_message"),
    errorCode: text("error_code"),
    rootCause: text("root_cause"),
    symptom: text("symptom"),
    logsText: text("logs_text"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("operations_project_idx").on(t.projectId),
    index("operations_service_idx").on(t.serviceId),
    uniqueIndex("operations_idempotency_idx").on(t.idempotencyKey),
  ],
)

/**
 * Explicit consumer (web/worker) → provider (postgres/redis) bindings.
 */
export const serviceBindings = sqliteTable(
  "service_bindings",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    consumerServiceId: text("consumer_service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    providerServiceId: text("provider_service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    envKey: text("env_key").notNull(),
    /** Optional role/username within the provider */
    principal: text("principal"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    index("service_bindings_project_idx").on(t.projectId),
    index("service_bindings_consumer_idx").on(t.consumerServiceId),
    uniqueIndex("service_bindings_consumer_env_idx").on(
      t.consumerServiceId,
      t.envKey,
    ),
  ],
)

/**
 * A resource link connects a resource (Postgres, Redis, S3, etc.) to a project.
 * Resources are linked to the project and shared across all deployable services.
 * Postgres/Redis use dedicated containers; S3 uses operator MinIO/R2 with on-demand buckets.
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
    /** shared-instance (S3) | dedicated-container (Postgres/Redis) | external */
    source: text("source", {
      enum: ["shared-instance", "dedicated-container", "external"],
    })
      .notNull()
      .default("dedicated-container"),
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
    /** Always "agent". Future cloud providers spawn agents; they are not node kinds. */
    provider: text("provider", {
      enum: ["agent"],
    })
      .notNull()
      .default("agent"),
    /** Advertise hint / display host */
    host: text("host").notNull(),
    port: integer("port").notNull().default(0),
    username: text("username"),
    /** @deprecated legacy SSH column — unused (agents only) */
    sshKeyEncrypted: text("ssh_key_encrypted"),
    /** sha256 of long-lived agent node token */
    agentTokenHash: text("agent_token_hash"),
    /** Host the control plane should proxy to (public IP / DNS) */
    advertiseHost: text("advertise_host"),
    agentVersion: text("agent_version"),
    capabilitiesJson: text("capabilities_json"),
    labelsJson: text("labels_json"),
    /** netbird | tailscale — required for remote agent app ingress */
    meshProvider: text("mesh_provider"),
    /** missing | logged_out | ready */
    meshStatus: text("mesh_status"),
    meshIp: text("mesh_ip"),
    meshHostname: text("mesh_hostname"),
    /** netbird_rp | tailscale_serve */
    edgeMode: text("edge_mode"),
    localProxyReady: integer("local_proxy_ready", { mode: "boolean" })
      .notNull()
      .default(false),
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
  (t) => [
    index("nodes_provider_idx").on(t.provider),
    index("nodes_agent_token_idx").on(t.agentTokenHash),
  ],
)

export const nodeJoinTokens = sqliteTable(
  "node_join_tokens",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    label: text("label"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    redeemedAt: integer("redeemed_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    nodeId: text("node_id").references(() => nodes.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("node_join_tokens_hash_idx").on(t.tokenHash)],
)

export const nodeJobs = sqliteTable(
  "node_jobs",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    operationId: text("operation_id").references(() => operations.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: ["deploy", "provision", "destroy", "stop", "logs"],
    }).notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status", {
      enum: ["pending", "claimed", "running", "succeeded", "failed"],
    })
      .notNull()
      .default("pending"),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    resultJson: text("result_json"),
    errorJson: text("error_json"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("node_jobs_node_status_idx").on(t.nodeId, t.status),
    index("node_jobs_operation_idx").on(t.operationId),
  ],
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
    /** Legacy agent pin; null for k3s-cluster deploys */
    nodeId: text("node_id").references(() => nodes.id, {
      onDelete: "set null",
    }),
    /** Linked operation row for queue tracking */
    operationId: text("operation_id").references(() => operations.id, {
      onDelete: "set null",
    }),
    /** Service name snapshot (from service.name at deploy time) */
    serviceName: text("service_name").notNull(),
    image: text("image"),
    dockerCompose: text("docker_compose"),
    /** dockerfile | railpack | image */
    buildStrategy: text("build_strategy"),
    buildLogs: text("build_logs"),
    sourcePath: text("source_path"),
    gitSha: text("git_sha"),
    gitBranch: text("git_branch"),
    failedStage: text("failed_stage"),
    /**
     * Living deploy status machine:
     * queued → analyzing → building → deploying → checking → running | failed
     * (pending kept as synonym for queued for older rows)
     */
    status: text("status", {
      enum: [
        "pending",
        "queued",
        "analyzing",
        "building",
        "deploying",
        "checking",
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
    index("deployments_operation_idx").on(t.operationId),
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
    /** @deprecated Prefer serviceId for data services */
    resourceLinkId: text("resource_link_id").references(
      () => resourceLinks.id,
      {
        onDelete: "cascade",
      },
    ),
    /** Data service being backed up (postgres/redis) */
    serviceId: text("service_id").references(() => services.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", {
      enum: ["postgres", "snapshot", "pitr_restore", "redis"],
    })
      .notNull()
      .default("snapshot"),
    storageKey: text("storage_key").notNull(),
    sizeBytes: integer("size_bytes"),
    status: text("status", {
      enum: ["running", "completed", "failed", "queued"],
    })
      .notNull()
      .default("running"),
    /** PITR target timestamp (ISO) when kind=pitr_restore */
    targetAt: text("target_at"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    index("backups_project_idx").on(t.projectId),
    index("backups_resource_link_idx").on(t.resourceLinkId),
    index("backups_service_idx").on(t.serviceId),
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
 * Tokens encrypted with HOSTRIG_SECRETS_KEY — never returned to clients.
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

/**
 * Container registries for build push + k8s imagePullSecrets.
 * Managed in Settings → Registries (instance admin).
 */
export const containerRegistries = sqliteTable(
  "container_registries",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: ["ghcr", "dockerhub", "gitlab", "generic"],
    }).notNull(),
    /** Registry host for docker login / dockerconfigjson (e.g. ghcr.io). */
    server: text("server").notNull(),
    /** Image prefix for pushes, e.g. ghcr.io/org/hostrig */
    imagePrefix: text("image_prefix").notNull(),
    username: text("username"),
    /** AES-GCM encrypted password/token; null if anonymous/public. */
    passwordEncrypted: text("password_encrypted"),
    /** Default target for git → build → push. At most one should be true. */
    isDefaultBuild: integer("is_default_build", { mode: "boolean" })
      .notNull()
      .default(false),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("container_registries_default_idx").on(t.isDefaultBuild)],
)

/**
 * Singleton platform ingress settings (app-managed; env seeds once).
 * id is always "default".
 */
/**
 * Singleton k3s/Kubernetes cluster connection for this Hostrig instance.
 * id is always "default".
 */
export const clusters = sqliteTable("clusters", {
  id: text("id").primaryKey().default("default"),
  name: text("name").notNull().default("default"),
  status: text("status", {
    enum: [
      "disconnected",
      "connecting",
      "connected",
      "provisioning",
      "error",
    ],
  })
    .notNull()
    .default("disconnected"),
  source: text("source", {
    enum: ["byo", "hetzner", "hetzner_k3s"],
  }),
  serverUrl: text("server_url"),
  externalIp: text("external_ip"),
  /** AES-GCM encrypted kubeconfig YAML */
  kubeconfigEncrypted: text("kubeconfig_encrypted"),
  /** AES-GCM encrypted k3s node join token */
  nodeTokenEncrypted: text("node_token_encrypted"),
  errorMessage: text("error_message"),
  /** One-time bootstrap token hash for cloud-init callback */
  bootstrapTokenHash: text("bootstrap_token_hash"),
  bootstrapTokenExpiresAt: integer("bootstrap_token_expires_at", {
    mode: "timestamp_ms",
  }),
  spawnedServerId: text("spawned_server_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
})

export const platformIngress = sqliteTable("platform_ingress", {
  id: text("id").primaryKey().default("default"),
  /** e.g. apps.example.com — empty disables auto public URLs */
  baseDomain: text("base_domain").notNull().default(""),
  publicProtocol: text("public_protocol", {
    enum: ["https", "http"],
  })
    .notNull()
    .default("https"),
  /** When true, web services get {slug}.{baseDomain} on deploy */
  autoDomainsEnabled: integer("auto_domains_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  /** cloudflare | netbird | tailscale | local — edge in front of Traefik */
  edgeMode: text("edge_mode", {
    enum: ["cloudflare", "netbird", "tailscale", "local", "mesh"],
  })
    .notNull()
    .default("local"),
  /** NetBird Management API base (cloud or self-hosted) */
  netbirdManagementUrl: text("netbird_management_url").default(
    "https://api.netbird.io",
  ),
  /** AES-GCM encrypted Personal Access Token */
  netbirdPatEncrypted: text("netbird_pat_encrypted"),
  netbirdSetupKeyId: text("netbird_setup_key_id"),
  netbirdPeerId: text("netbird_peer_id"),
  netbirdPeerName: text("netbird_peer_name"),
  netbirdDomainMode: text("netbird_domain_mode", {
    enum: ["managed", "custom"],
  }).default("managed"),
  netbirdStatus: text("netbird_status", {
    enum: ["disconnected", "connecting", "connected", "error"],
  })
    .notNull()
    .default("disconnected"),
  netbirdStatusMessage: text("netbird_status_message"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
})

/** Maps Hostrig hostnames → NetBird reverse-proxy service IDs */
export const netbirdServices = sqliteTable(
  "netbird_services",
  {
    id: text("id").primaryKey(),
    hostname: text("hostname").notNull(),
    serviceId: text("service_id"),
    netbirdServiceId: text("netbird_service_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("netbird_services_hostname_idx").on(t.hostname)],
)

/**
 * Hostnames attached to a service for Caddy Host routing.
 * kind=auto (v1), custom/preview (v2+). Multiple active hosts share one upstream.
 */
export const serviceHostnames = sqliteTable(
  "service_hostnames",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    kind: text("kind", { enum: ["auto", "custom", "preview"] }).notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Preview slot key for kind=preview (e.g. PR number) */
    previewKey: text("preview_key"),
    status: text("status", {
      enum: ["active", "pending", "disabled"],
    })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("service_hostnames_hostname_idx").on(t.hostname),
    index("service_hostnames_service_idx").on(t.serviceId),
  ],
)

/**
 * Operator MCP personal access tokens (Bearer for /api/mcp).
 * Plaintext shown once at creation; only tokenHash is stored.
 */
export const mcpTokens = sqliteTable(
  "mcp_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 hex of the full token */
    tokenHash: text("token_hash").notNull().unique(),
    /** First 8 chars of token for display (e.g. hostrig_ab12…) */
    prefix: text("prefix").notNull(),
    /** JSON string array of scopes; `["*"]` means full account access. */
    scopesJson: text("scopes_json").notNull().default('["*"]'),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("mcp_tokens_user_idx").on(t.userId),
    index("mcp_tokens_hash_idx").on(t.tokenHash),
  ],
)

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

export const organizationsRelations = relations(
  organizations,
  ({ many }) => ({
    members: many(organizationMembers),
    invites: many(organizationInvites),
    projects: many(projects),
  }),
)

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.organizationId],
      references: [organizations.id],
    }),
    user: one(user, {
      fields: [organizationMembers.userId],
      references: [user.id],
    }),
  }),
)

export const organizationInvitesRelations = relations(
  organizationInvites,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationInvites.organizationId],
      references: [organizations.id],
    }),
    invitedBy: one(user, {
      fields: [organizationInvites.invitedByUserId],
      references: [user.id],
    }),
  }),
)

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
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
  operations: many(operations),
  serviceBindings: many(serviceBindings),
}))

export const servicesRelations = relations(services, ({ one, many }) => ({
  project: one(projects, {
    fields: [services.projectId],
    references: [projects.id],
  }),
  deployments: many(deployments),
  operations: many(operations),
  hostnames: many(serviceHostnames),
  consumerBindings: many(serviceBindings, {
    relationName: "consumerBindings",
  }),
  providerBindings: many(serviceBindings, {
    relationName: "providerBindings",
  }),
}))

export const serviceHostnamesRelations = relations(
  serviceHostnames,
  ({ one }) => ({
    service: one(services, {
      fields: [serviceHostnames.serviceId],
      references: [services.id],
    }),
  }),
)

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

export const operationsRelations = relations(operations, ({ one }) => ({
  project: one(projects, {
    fields: [operations.projectId],
    references: [projects.id],
  }),
  service: one(services, {
    fields: [operations.serviceId],
    references: [services.id],
  }),
}))

export const serviceBindingsRelations = relations(
  serviceBindings,
  ({ one }) => ({
    project: one(projects, {
      fields: [serviceBindings.projectId],
      references: [projects.id],
    }),
    consumer: one(services, {
      fields: [serviceBindings.consumerServiceId],
      references: [services.id],
      relationName: "consumerBindings",
    }),
    provider: one(services, {
      fields: [serviceBindings.providerServiceId],
      references: [services.id],
      relationName: "providerBindings",
    }),
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
  operation: one(operations, {
    fields: [deployments.operationId],
    references: [operations.id],
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
  service: one(services, {
    fields: [backups.serviceId],
    references: [services.id],
  }),
}))

/* ── Observe (errors / telemetry metadata — payloads live in ClickHouse) ─ */

export const observeProjects = sqliteTable(
  "observe_projects",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sentryId: integer("sentry_id").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    retentionMaxEventCount: integer("retention_max_event_count")
      .notNull()
      .default(10_000),
    retentionMaxAgeDays: integer("retention_max_age_days")
      .notNull()
      .default(30),
    spanRetentionDays: integer("span_retention_days").notNull().default(7),
    quotaPer5m: integer("quota_per_5m").notNull().default(1000),
    quotaPerHour: integer("quota_per_hour").notNull().default(5000),
    quotaPerMonth: integer("quota_per_month").notNull().default(1_000_000),
    groupingMechanism: text("grouping_mechanism").notNull().default("hostrig-v1"),
    digestCounter: integer("digest_counter").notNull().default(0),
    storedEventCount: integer("stored_event_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("observe_projects_project_idx").on(t.projectId),
    uniqueIndex("observe_projects_sentry_id_idx").on(t.sentryId),
  ],
)

export const observeKeys = sqliteTable(
  "observe_keys",
  {
    id: text("id").primaryKey(),
    observeProjectId: text("observe_project_id")
      .notNull()
      .references(() => observeProjects.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    name: text("name").notNull().default("default"),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("observe_keys_public_key_idx").on(t.publicKey),
    index("observe_keys_observe_project_idx").on(t.observeProjectId),
  ],
)

export const observeIssues = sqliteTable(
  "observe_issues",
  {
    id: text("id").primaryKey(),
    observeProjectId: text("observe_project_id")
      .notNull()
      .references(() => observeProjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    culprit: text("culprit").notNull().default(""),
    level: text("level").notNull().default("error"),
    status: text("status", {
      enum: ["unresolved", "resolved", "muted"],
    })
      .notNull()
      .default("unresolved"),
    digestedEventCount: integer("digested_event_count").notNull().default(0),
    firstSeen: integer("first_seen", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    lastSeen: integer("last_seen", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    lastEventId: text("last_event_id"),
    lastTraceId: text("last_trace_id"),
    assigneeUserId: text("assignee_user_id"),
    priority: text("priority", {
      enum: ["low", "medium", "high"],
    })
      .notNull()
      .default("medium"),
    externalIssueUrl: text("external_issue_url"),
    isDeleted: integer("is_deleted", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("observe_issues_project_idx").on(t.observeProjectId),
    index("observe_issues_status_idx").on(t.observeProjectId, t.status),
  ],
)

export const observeGroupings = sqliteTable(
  "observe_groupings",
  {
    id: text("id").primaryKey(),
    observeProjectId: text("observe_project_id")
      .notNull()
      .references(() => observeProjects.id, { onDelete: "cascade" }),
    mechanism: text("mechanism").notNull(),
    groupingKey: text("grouping_key").notNull(),
    groupingKeyHash: text("grouping_key_hash").notNull(),
    issueId: text("issue_id")
      .notNull()
      .references(() => observeIssues.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("observe_groupings_hash_idx").on(
      t.observeProjectId,
      t.mechanism,
      t.groupingKeyHash,
    ),
    index("observe_groupings_issue_idx").on(t.issueId),
  ],
)

export const observeEventCountsHourly = sqliteTable(
  "observe_event_counts_hourly",
  {
    id: text("id").primaryKey(),
    scope: text("scope", { enum: ["project", "issue"] }).notNull(),
    scopeId: text("scope_id").notNull(),
    hour: text("hour").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("observe_event_counts_hourly_uidx").on(
      t.scope,
      t.scopeId,
      t.hour,
    ),
  ],
)

export const observeMembers = sqliteTable(
  "observe_members",
  {
    id: text("id").primaryKey(),
    observeProjectId: text("observe_project_id")
      .notNull()
      .references(() => observeProjects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role", {
      enum: ["owner", "admin", "editor", "viewer"],
    })
      .notNull()
      .default("viewer"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("observe_members_uidx").on(t.observeProjectId, t.userId),
    index("observe_members_project_idx").on(t.observeProjectId),
  ],
)

export const observeSavedViews = sqliteTable(
  "observe_saved_views",
  {
    id: text("id").primaryKey(),
    observeProjectId: text("observe_project_id")
      .notNull()
      .references(() => observeProjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    surface: text("surface").notNull().default("explore"),
    contextJson: text("context_json").notNull(),
    createdBy: text("created_by"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("observe_saved_views_project_idx").on(t.observeProjectId)],
)

export const observeInsights = sqliteTable(
  "observe_insights",
  {
    id: text("id").primaryKey(),
    observeProjectId: text("observe_project_id")
      .notNull()
      .references(() => observeProjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    specJson: text("spec_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("observe_insights_project_idx").on(t.observeProjectId)],
)

export const observeDashboards = sqliteTable(
  "observe_dashboards",
  {
    id: text("id").primaryKey(),
    observeProjectId: text("observe_project_id")
      .notNull()
      .references(() => observeProjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    template: text("template").notNull().default("blank"),
    layoutJson: text("layout_json").notNull().default('{"widgets":[]}'),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("observe_dashboards_project_idx").on(t.observeProjectId)],
)

export const observeAlerts = sqliteTable(
  "observe_alerts",
  {
    id: text("id").primaryKey(),
    observeProjectId: text("observe_project_id")
      .notNull()
      .references(() => observeProjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    kind: text("kind", { enum: ["threshold", "relative"] })
      .notNull()
      .default("threshold"),
    metric: text("metric").notNull().default("error_rate"),
    operator: text("operator").notNull().default("gt"),
    threshold: text("threshold").notNull().default("0.05"),
    window: text("window").notNull().default("5m"),
    contextJson: text("context_json").notNull().default("{}"),
    channelEmail: text("channel_email"),
    channelWebhook: text("channel_webhook"),
    /** JSON string array of message_channels.id */
    channelIdsJson: text("channel_ids_json").notNull().default("[]"),
    lastTriggeredAt: integer("last_triggered_at", { mode: "timestamp_ms" }),
    /** OK | pending | firing | recovering */
    state: text("state").notNull().default("ok"),
    pendingSince: integer("pending_since", { mode: "timestamp_ms" }),
    severity: text("severity").notNull().default("warning"),
    evaluationIntervalSec: integer("evaluation_interval_sec")
      .notNull()
      .default(60),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("observe_alerts_project_idx").on(t.observeProjectId)],
)

/** Alert state transition history for detail views. */
export const observeAlertHistory = sqliteTable(
  "observe_alert_history",
  {
    id: text("id").primaryKey(),
    alertId: text("alert_id")
      .notNull()
      .references(() => observeAlerts.id, { onDelete: "cascade" }),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    value: text("value"),
    threshold: text("threshold"),
    message: text("message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("observe_alert_history_alert_idx").on(t.alertId)],
)

/** Slack / Discord / webhook / email destinations for alerts & notifications. */
export const messageChannels = sqliteTable("message_channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", {
    enum: ["slack", "discord", "webhook", "email"],
  }).notNull(),
  /** AES-GCM ciphertext when prefixed with enc:v1: ; legacy plaintext JSON otherwise */
  configJson: text("config_json").notNull().default("{}"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  organizationId: text("organization_id"),
  createdBy: text("created_by"),
  lastTestedAt: integer("last_tested_at", { mode: "timestamp_ms" }),
  lastTestOk: integer("last_test_ok", { mode: "boolean" }),
  lastDeliveryAt: integer("last_delivery_at", { mode: "timestamp_ms" }),
  lastDeliveryOk: integer("last_delivery_ok", { mode: "boolean" }),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
})

export const observeProjectsRelations = relations(
  observeProjects,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [observeProjects.projectId],
      references: [projects.id],
    }),
    keys: many(observeKeys),
    issues: many(observeIssues),
    groupings: many(observeGroupings),
  }),
)

export const observeKeysRelations = relations(observeKeys, ({ one }) => ({
  observeProject: one(observeProjects, {
    fields: [observeKeys.observeProjectId],
    references: [observeProjects.id],
  }),
}))

export const observeIssuesRelations = relations(
  observeIssues,
  ({ one, many }) => ({
    observeProject: one(observeProjects, {
      fields: [observeIssues.observeProjectId],
      references: [observeProjects.id],
    }),
    groupings: many(observeGroupings),
  }),
)

export const observeGroupingsRelations = relations(
  observeGroupings,
  ({ one }) => ({
    observeProject: one(observeProjects, {
      fields: [observeGroupings.observeProjectId],
      references: [observeProjects.id],
    }),
    issue: one(observeIssues, {
      fields: [observeGroupings.issueId],
      references: [observeIssues.id],
    }),
  }),
)
