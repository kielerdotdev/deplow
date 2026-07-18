import type {
  DatabaseCredentials,
  RedisCredentials,
  ResourceCredentials,
} from "@hostrig/shared"

import type { DataServiceDriver } from "./data-services"
import { StorageProvisioner } from "./infra/storage"
import type { PlatformConfig } from "./platform-config"

export type BackupKind = "snapshot" | "postgres" | "pitr_restore" | "redis"

export interface BackupRecord {
  id: string
  projectId: string
  resourceLinkId?: string | null
  serviceId?: string | null
  storageKey: string
  sizeBytes: number
  status: "running" | "completed" | "failed" | "queued"
  kind?: BackupKind
  targetAt?: string | null
  errorMessage?: string
  createdAt?: string
}

export interface BackupStore {
  createRunning(
    projectId: string,
    storageKey: string,
    kind?: BackupKind,
    targetAt?: string | null,
    resourceLinkId?: string | null,
    serviceId?: string | null,
  ): Promise<BackupRecord>
  complete(id: string, sizeBytes: number): Promise<void>
  fail(id: string, message: string): Promise<void>
  get(id: string): Promise<BackupRecord | null>
  list(
    projectId: string,
    limit?: number,
    /** Filter by legacy resource link id or data service id */
    targetId?: string | null,
  ): Promise<BackupRecord[]>
  listExpired(
    projectId: string,
    keep: number,
    targetId?: string | null,
  ): Promise<BackupRecord[]>
  deleteMany(ids: string[]): Promise<void>
  getLastBackupAt(projectId: string): Promise<Date | null>
  getIntervalMs(projectId: string): Promise<number | null>
}

export type BackupTarget = {
  /** @deprecated Prefer serviceId for service-first data services */
  resourceLinkId: string
  serviceId?: string | null
  kind: "postgres" | "redis" | "s3"
  credentials: ResourceCredentials
  driver: DataServiceDriver
}

export type BackupRunOptions = {
  force?: boolean
}

/**
 * Backs up project data services via driver BackupCapable interfaces.
 */
export class BackupService {
  private readonly storage: StorageProvisioner

  constructor(
    private readonly config: PlatformConfig,
    private readonly store: BackupStore,
  ) {
    this.storage = new StorageProvisioner(config)
  }

  static retainCount(): number {
    const raw = process.env.HOSTRIG_BACKUP_RETAIN
    if (raw) {
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 1) return Math.floor(n)
    }
    return 7
  }

  async run(
    projectId: string,
    target: BackupTarget,
    options: BackupRunOptions = {},
  ): Promise<BackupRecord> {
    if (!target.driver.backup) {
      throw new Error(`Resource ${target.kind} does not support backups`)
    }

    const targetKey = target.serviceId || target.resourceLinkId || null
    if (!options.force) {
      const skipped = await this.shouldSkip(projectId, targetKey)
      if (skipped) return skipped
    }

    await this.storage.ensureBackupBucket()
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const result = await target.driver.backup.backup(target.credentials)
    const key = `projects/${projectId}/${target.kind}-${timestamp}-${result.keySuffix}`

    const record = await this.store.createRunning(
      projectId,
      key,
      result.kind === "postgres" ? "snapshot" : result.kind,
      null,
      target.resourceLinkId || null,
      target.serviceId ?? null,
    )

    try {
      await this.storage.putObject(
        this.config.backupBucket,
        key,
        result.body,
        result.contentType,
      )
      await this.store.complete(record.id, result.body.byteLength)
      await this.prune(
        projectId,
        BackupService.retainCount(),
        targetKey,
      )
      return {
        ...record,
        status: "completed",
        sizeBytes: result.body.byteLength,
        kind: result.kind === "postgres" ? "snapshot" : result.kind,
        resourceLinkId: target.resourceLinkId || null,
        serviceId: target.serviceId ?? null,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.store.fail(record.id, message)
      throw error
    }
  }

  /** Back up every backup-capable target for a project. */
  async runAll(
    projectId: string,
    targets: BackupTarget[],
    options: BackupRunOptions = {},
  ): Promise<BackupRecord[]> {
    const results: BackupRecord[] = []
    for (const target of targets) {
      if (!target.driver.capabilities.backup) continue
      results.push(await this.run(projectId, target, options))
    }
    return results
  }

  async restore(
    projectId: string,
    backupId: string,
    target: BackupTarget,
  ): Promise<BackupRecord> {
    if (!target.driver.backup) {
      throw new Error(`Resource ${target.kind} does not support restore`)
    }
    const source = await this.store.get(backupId)
    if (!source || source.projectId !== projectId) {
      throw new Error("Backup not found")
    }
    if (source.status !== "completed") {
      throw new Error("Backup is not ready to restore")
    }
    if (source.kind === "pitr_restore") {
      throw new Error("This backup type cannot be restored as a snapshot")
    }
    if (
      (source.serviceId &&
        target.serviceId &&
        source.serviceId !== target.serviceId) ||
      (source.resourceLinkId &&
        !source.serviceId &&
        source.resourceLinkId !== target.resourceLinkId)
    ) {
      throw new Error("Backup belongs to a different resource")
    }

    const jobKey = `projects/${projectId}/restore-${Date.now()}.log`
    const job = await this.store.createRunning(
      projectId,
      jobKey,
      "pitr_restore",
      null,
      target.resourceLinkId || null,
      target.serviceId ?? null,
    )

    try {
      const dump = await this.storage.getObject(
        this.config.backupBucket,
        source.storageKey,
      )
      await target.driver.backup.restore(target.credentials, dump)
      await this.store.complete(job.id, dump.byteLength)
      return { ...job, status: "completed", sizeBytes: dump.byteLength }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.store.fail(job.id, message)
      throw error
    }
  }

  async download(
    projectId: string,
    backupId: string,
  ): Promise<{ storageKey: string; body: Buffer; contentType: string }> {
    const source = await this.store.get(backupId)
    if (!source || source.projectId !== projectId) {
      throw new Error("Backup not found")
    }
    if (source.status !== "completed") {
      throw new Error("Backup is not ready")
    }
    const body = await this.storage.getObject(
      this.config.backupBucket,
      source.storageKey,
    )
    return {
      storageKey: source.storageKey,
      body,
      contentType: source.storageKey.includes("redis")
        ? "application/json"
        : "application/octet-stream",
    }
  }

  async list(
    projectId: string,
    limit = BackupService.retainCount() * 3,
    resourceLinkId?: string | null,
  ): Promise<BackupRecord[]> {
    return this.store.list(projectId, limit, resourceLinkId)
  }

  async prune(
    projectId: string,
    keep = BackupService.retainCount(),
    resourceLinkId?: string | null,
  ): Promise<number> {
    const all = await this.store.list(projectId, 10_000, resourceLinkId)
    const snapshots = all.filter(
      (r) =>
        r.status === "completed" &&
        (r.kind === "snapshot" ||
          r.kind === "postgres" ||
          r.kind === "redis" ||
          !r.kind),
    )
    const expired = snapshots.slice(keep)
    if (expired.length === 0) return 0

    for (const row of expired) {
      try {
        await this.storage.deleteObject(
          this.config.backupBucket,
          row.storageKey,
        )
      } catch {
        // Object may already be gone
      }
    }
    await this.store.deleteMany(expired.map((r) => r.id))
    return expired.length
  }

  async schedule(
    projectId: string,
    cronOrInterval: string,
    register?: (projectId: string, intervalMs: number) => void,
  ): Promise<{ projectId: string; intervalMs: number }> {
    let intervalMs = 24 * 60 * 60 * 1000
    if (cronOrInterval === "daily") {
      intervalMs = Number(
        process.env.HOSTRIG_BACKUP_DEFAULT_INTERVAL_MS ?? intervalMs,
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

  private async shouldSkip(
    projectId: string,
    targetId: string | null,
  ): Promise<BackupRecord | null> {
    const [lastAt, intervalMs] = await Promise.all([
      this.store.getLastBackupAt(projectId),
      this.store.getIntervalMs(projectId),
    ])
    if (!lastAt || !intervalMs) return null
    const age = Date.now() - lastAt.getTime()
    if (age < intervalMs * 0.9) {
      const recent = await this.store.list(projectId, 1, targetId)
      return (
        recent[0] ?? {
          id: "skipped",
          projectId,
          resourceLinkId: targetId,
          storageKey: "",
          sizeBytes: 0,
          status: "completed",
        }
      )
    }
    return null
  }
}

export type { DatabaseCredentials, RedisCredentials }
