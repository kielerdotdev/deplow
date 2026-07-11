import {
  and,
  backups,
  db,
  deployments,
  desc,
  eq,
  nodes,
  projects,
  resourceLinks,
  services,
} from "@deplow/db"
import type { ProjectCredentials } from "@deplow/shared"

import {
  BackupScheduler,
  BackupService,
  type BackupRecord,
  type BackupStore,
  BuildService,
  DockerNodeExecutor,
  GitService,
  ProxyService,
  ProvisioningService,
  ResourceLinkService,
  createCaddyReloadOnChange,
  loadPlatformConfig,
} from "@/lib/core"

const config = loadPlatformConfig()

const backupStore: BackupStore = {
  async createRunning(projectId, storageKey) {
    const id = crypto.randomUUID()
    await db.insert(backups).values({
      id,
      projectId,
      storageKey,
      status: "running",
      kind: "postgres",
    })
    return {
      id,
      projectId,
      storageKey,
      sizeBytes: 0,
      status: "running",
    }
  },
  async complete(id, sizeBytes) {
    const [row] = await db.select().from(backups).where(eq(backups.id, id))
    await db
      .update(backups)
      .set({ status: "completed", sizeBytes })
      .where(eq(backups.id, id))
    if (row) {
      await db
        .update(projects)
        .set({ lastBackupAt: new Date() })
        .where(eq(projects.id, row.projectId))
    }
  },
  async fail(id, message) {
    await db
      .update(backups)
      .set({ status: "failed", errorMessage: message })
      .where(eq(backups.id, id))
  },
  async list(projectId) {
    const rows = await db
      .select()
      .from(backups)
      .where(eq(backups.projectId, projectId))
      .orderBy(desc(backups.createdAt))
    return rows.map(
      (r): BackupRecord => ({
        id: r.id,
        projectId: r.projectId,
        storageKey: r.storageKey,
        sizeBytes: r.sizeBytes ?? 0,
        status: r.status,
        errorMessage: r.errorMessage ?? undefined,
      }),
    )
  },
}

export const platformConfig = config

export const provisioningService = new ProvisioningService(config, undefined)

export const resourceLinkService = new ResourceLinkService(config)

export const backupService = new BackupService(config, backupStore)

export const backupScheduler = new BackupScheduler(backupService)

export const buildService = new BuildService({
  railpackBin: process.env.RAILPACK_BIN ?? "railpack",
  buildkitHost: process.env.BUILDKIT_HOST ?? "docker-container://buildkit",
})

export const dockerNodeExecutor = new DockerNodeExecutor(
  config,
  async (nodeId) => {
    const [row] = await db.select().from(nodes).where(eq(nodes.id, nodeId))
    if (!row || row.provider !== "docker") return null
    return { id: row.id, name: row.name, host: row.host }
  },
)

export const proxyService = new ProxyService({
  routesDir: config.proxyRoutesDir,
  baseDomain: config.baseDomain,
  publicProtocol: config.publicUrlProtocol,
  // Caddy only re-reads routes/*.caddy on reload — wire after every upsert/remove
  onChange: createCaddyReloadOnChange({
    containerName: process.env.DEPLOW_CADDY_CONTAINER ?? "deplow-caddy",
  }),
})

export const gitService = new GitService(config.gitCloneRoot)

export async function getProjectCredentials(
  projectId: string,
): Promise<ProjectCredentials | null> {
  const links = await db
    .select()
    .from(resourceLinks)
    .where(eq(resourceLinks.projectId, projectId))
  return resourceLinkService.assemble(links)
}

export function scheduleProjectBackups(
  projectId: string,
  intervalMs: number,
): void {
  backupScheduler.schedule({
    projectId,
    intervalMs,
    getCredentials: async () => {
      return getProjectCredentials(projectId)
    },
  })
}

/** Ensure the local Docker node exists; return its id. */
export async function ensureLocalNodeId(): Promise<string> {
  const [existing] = await db
    .select()
    .from(nodes)
    .where(eq(nodes.name, "local"))
  if (existing) return existing.id

  const id = crypto.randomUUID()
  const probe = await dockerNodeExecutor.getStatus(id)
  await db.insert(nodes).values({
    id,
    name: "local",
    provider: "docker",
    host: "local",
    port: 22,
    status: probe.online ? "online" : "offline",
    lastSeenAt: probe.online ? new Date() : null,
  })
  return id
}

/** Resume schedules for ready projects (web process start). */
export async function resumeBackupSchedules(): Promise<number> {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.status, "ready"))
  for (const row of rows) {
    scheduleProjectBackups(
      row.id,
      row.backupIntervalMs ?? BackupScheduler.defaultIntervalMs(),
    )
  }
  return rows.length
}

// Fire-and-forget on module load (server only)
if (typeof process !== "undefined" && process.env.VITEST !== "true") {
  void resumeBackupSchedules().catch((err) => {
    console.error("Failed to resume backup schedules", err)
  })
}

export {
  db,
  projects,
  services,
  resourceLinks,
  nodes,
  deployments,
  backups,
  eq,
  and,
  desc,
}
