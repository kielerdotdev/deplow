import type { ProjectCredentials } from "@deplow/shared"

import type { BackupService } from "./backup.service"

export interface ScheduledProject {
  projectId: string
  intervalMs: number
  getCredentials: () => Promise<ProjectCredentials | null>
}

/**
 * In-process backup scheduler (v1).
 * One interval timer per project; fires BackupService.run without manual API calls.
 */
export class BackupScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>()
  private readonly meta = new Map<string, ScheduledProject>()

  constructor(private readonly backupService: BackupService) {}

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
    const timer = setInterval(() => {
      void this.tick(project.projectId)
    }, project.intervalMs)
    // Don't keep the process alive solely for backups in tests
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

  /** Exposed for tests / forced verification ticks */
  async tick(projectId: string): Promise<"ok" | "skipped" | "failed"> {
    const project = this.meta.get(projectId)
    if (!project) return "skipped"
    try {
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
