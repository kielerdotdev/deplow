import { relations } from "drizzle-orm"
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

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
    status: text("status", {
      enum: ["provisioning", "ready", "error", "destroying"],
    })
      .notNull()
      .default("provisioning"),
    /** AES-GCM encrypted JSON of Database/Redis/Storage credentials */
    credentialsEncrypted: text("credentials_encrypted"),
    secretsYaml: text("secrets_yaml"),
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
  (t) => [index("projects_owner_idx").on(t.ownerId)],
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
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    serviceName: text("service_name").notNull(),
    image: text("image"),
    dockerCompose: text("docker_compose"),
    /** dockerfile | railpack | image */
    buildStrategy: text("build_strategy"),
    buildLogs: text("build_logs"),
    sourcePath: text("source_path"),
    status: text("status", {
      enum: ["pending", "building", "running", "failed", "stopped"],
    })
      .notNull()
      .default("pending"),
    containerId: text("container_id"),
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
    index("deployments_project_idx").on(t.projectId),
    index("deployments_node_idx").on(t.nodeId),
  ],
)

export const backups = sqliteTable(
  "backups",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
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
  (t) => [index("backups_project_idx").on(t.projectId)],
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

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(user, {
    fields: [projects.ownerId],
    references: [user.id],
  }),
  deployments: many(deployments),
  backups: many(backups),
}))

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  project: one(projects, {
    fields: [deployments.projectId],
    references: [projects.id],
  }),
  node: one(nodes, {
    fields: [deployments.nodeId],
    references: [nodes.id],
  }),
}))
