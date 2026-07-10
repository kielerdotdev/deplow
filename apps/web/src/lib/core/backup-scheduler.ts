import type { ProjectCredentials } from "@deplow/shared"

import { isBackupDue } from "./backup-due"
import type { BackupService } from "./backup.service"

export interface ScheduledProject {
  projectId: string
  intervalMs: number
  getCredentials: () => Promise<ProjectCredentials | null>
  /**
   * Optional: last successful backup time from durable storage.
   * When provided, ticks skip until isBackupDue is true (survives restarts).
   */
  getLastBackupAt?: () => Promise<Date | string | number | null | undefined>
}

/**
 * In-process backup scheduler (v1).
 * Polls on an interval; actual run gated by persisted lastBackupAt + intervalMs.
 */
export class BackupScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>()
  private readonly meta = new Map<string, ScheduledProject>()
  /** Min wall-clock poll so we can honor lastBackupAt without long setTimeouts */
  private readonly pollMs: number

  constructor(
    private readonly backupService: BackupService,
    options?: { pollMs?: number },
  ) {
    this.pollMs = options?.pollMs ?? 60_000
  }

  /** Default daily unless DEPLOW_BACKUP_DEFAULT_INTERVAL_MS is set */
  static defaultIntervalMs(): number {
    const raw = process.env.DEPLOW_BACKUP_DEFAULT_INTERVAL_MS
    if (raw) {
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 1000) return n
    }
    return 24 * 60 * 60 * 1000
  }

  list(): Array<{ projectId: string; intervalMs: number }> {
    return [...this.meta.values()].map((m) => ({
      projectId: m.projectId,
      intervalMs: m.intervalMs,
    }))
  }

  isScheduled(projectId: string): boolean {
    return this.timers.has(projectId)
  }

  schedule(project: ScheduledProject): void {
    this.unschedule(project.projectId)
    this.meta.set(project.projectId, project)
    // Poll at min(interval, pollMs) so short intervals still work in tests
    const every = Math.min(Math.max(project.intervalMs, 100), this.pollMs)
    const timer = setInterval(() => {
      void this.tick(project.projectId)
    }, every)
    if (typeof timer === "object" && "unref" in timer) {
      timer.unref()
    }
    this.timers.set(project.projectId, timer)
  }

  unschedule(projectId: string): void {
    const timer = this.timers.get(projectId)
    if (timer) clearInterval(timer)
    this.timers.delete(projectId)
    this.meta.delete(projectId)
  }

  /**
   * Exposed for tests / forced verification ticks.
   * Skips when lastBackupAt says not due yet.
   */
  async tick(projectId: string): Promise<"ok" | "skipped" | "failed"> {
    const project = this.meta.get(projectId)
    if (!project) return "skipped"
    try {
      if (project.getLastBackupAt) {
        const lastBackupAt = await project.getLastBackupAt()
        if (
          !isBackupDue({
            lastBackupAt,
            intervalMs: project.intervalMs,
          })
        ) {
          return "skipped"
        }
      }
      const credentials = await project.getCredentials()
      if (!credentials) return "skipped"
      await this.backupService.run(projectId, credentials)
      return "ok"
    } catch {
      return "failed"
    }
  }

  stopAll(): void {
    for (const id of [...this.timers.keys()]) {
      this.unschedule(id)
    }
  }
}
