import type { ProjectCredentials } from "@deplow/shared"

import { PostgresProvisioner } from "./infra/postgres"
import { StorageProvisioner } from "./infra/storage"
import type { PlatformConfig } from "./platform-config"

export interface BackupRecord {
  id: string
  projectId: string
  storageKey: string
  sizeBytes: number
  status: "running" | "completed" | "failed"
  errorMessage?: string
}

export interface BackupStore {
  createRunning(projectId: string, storageKey: string): Promise<BackupRecord>
  complete(id: string, sizeBytes: number): Promise<void>
  fail(id: string, message: string): Promise<void>
  list(projectId: string): Promise<BackupRecord[]>
}

/**
 * Backs up project Postgres databases into platform object storage.
 */
export class BackupService {
  private readonly postgres: PostgresProvisioner
  private readonly storage: StorageProvisioner

  constructor(
    private readonly config: PlatformConfig,
    private readonly store: BackupStore,
  ) {
    this.postgres = new PostgresProvisioner(config)
    this.storage = new StorageProvisioner(config)
  }

  async run(
    projectId: string,
    credentials: ProjectCredentials,
  ): Promise<BackupRecord> {
    await this.storage.ensureBackupBucket()
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const storageKey = `projects/${projectId}/postgres-${timestamp}.sql`
    const record = await this.store.createRunning(projectId, storageKey)

    try {
      const dump = await this.postgres.dumpDatabase(credentials.database)
      await this.storage.putObject(
        this.config.backupBucket,
        storageKey,
        dump,
        "application/sql",
      )
      await this.store.complete(record.id, dump.byteLength)
      return { ...record, status: "completed", sizeBytes: dump.byteLength }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.store.fail(record.id, message)
      throw error
    }
  }

  async list(projectId: string): Promise<BackupRecord[]> {
    return this.store.list(projectId)
  }

  /**
   * @deprecated Use BackupScheduler.schedule — kept for API symmetry.
   * intervalMs defaults to BackupScheduler.defaultIntervalMs() when cron is "daily".
   */
  async schedule(
    projectId: string,
    cronOrInterval: string,
    register?: (projectId: string, intervalMs: number) => void,
  ): Promise<{ projectId: string; intervalMs: number }> {
    let intervalMs = 24 * 60 * 60 * 1000
    if (cronOrInterval === "daily") {
      intervalMs = Number(
        process.env.DEPLOW_BACKUP_DEFAULT_INTERVAL_MS ?? intervalMs,
      )
    } else if (/^\d+$/.test(cronOrInterval)) {
      intervalMs = Number(cronOrInterval)
    }
    if (intervalMs < 1000) {
      throw new Error("Backup interval must be at least 1000ms")
    }
    register?.(projectId, intervalMs)
    return { projectId, intervalMs }
  }
}
