import {
  and,
  backups,
  db,
  deployments,
  desc,
  eq,
  nodes,
  projects,
} from "@deplow/db"
import type { ProjectCredentials } from "@deplow/shared"

import {
  BackupScheduler,
  BackupService,
  type BackupRecord,
  type BackupStore,
  BuildService,
  DockerNodeExecutor,
  ProvisioningService,
  createServerSpawners,
  decryptString,
  loadPlatformConfig,
} from "@/lib/core"

const config = loadPlatformConfig()
const spawners = createServerSpawners(config)

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

export const provisioningService = new ProvisioningService(
  config,
  undefined,
  spawners,
)

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

export function decryptProjectCredentials(
  encrypted: string | null | undefined,
): ProjectCredentials | null {
  if (!encrypted) return null
  const json = decryptString(encrypted, config.secretsEncryptionKey)
  return JSON.parse(json) as ProjectCredentials
}

export function scheduleProjectBackups(
  projectId: string,
  intervalMs: number,
): void {
  backupScheduler.schedule({
    projectId,
    intervalMs,
    getCredentials: async () => {
      const [row] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
      if (!row) return null
      return decryptProjectCredentials(row.credentialsEncrypted)
    },
  })
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

export { db, projects, nodes, deployments, backups, eq, and, desc }
