import type { BackupService, BackupTarget } from "./backup.service"

export interface ScheduledProject {
  projectId: string
  intervalMs: number
  getTargets: () => Promise<BackupTarget[]>
}

/** One hour — demos may go lower only with DEPLOW_BACKUP_ALLOW_FAST=1 */
export const BACKUP_MIN_INTERVAL_MS = 60 * 60 * 1000
export const BACKUP_DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * In-process backup scheduler (v1).
 * One interval timer per project; backs up every BackupCapable resource link.
 */
export class BackupScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>()
  private readonly meta = new Map<string, ScheduledProject>()

  constructor(private readonly backupService: BackupService) {}

  static defaultIntervalMs(): number {
    const raw = process.env.DEPLOW_BACKUP_DEFAULT_INTERVAL_MS
    if (raw) {
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 1000) {
        return BackupScheduler.normalizeIntervalMs(n)
      }
    }
    return BACKUP_DEFAULT_INTERVAL_MS
  }

  static normalizeIntervalMs(intervalMs: number): number {
    if (!Number.isFinite(intervalMs) || intervalMs < 1000) {
      return BACKUP_DEFAULT_INTERVAL_MS
    }
    const allowFast = process.env.DEPLOW_BACKUP_ALLOW_FAST === "1"
    if (!allowFast && intervalMs < BACKUP_MIN_INTERVAL_MS) {
      return BACKUP_DEFAULT_INTERVAL_MS
    }
    return Math.floor(intervalMs)
  }

  static allowFastIntervals(): boolean {
    return process.env.DEPLOW_BACKUP_ALLOW_FAST === "1"
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
    const timer = setInterval(() => {
      void this.tick(project.projectId)
    }, project.intervalMs)
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

  async tick(projectId: string): Promise<"ok" | "skipped" | "failed"> {
    const project = this.meta.get(projectId)
    if (!project) return "skipped"
    try {
      const targets = await project.getTargets()
      if (targets.length === 0) return "skipped"
      await this.backupService.runAll(projectId, targets)
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
