import { afterEach, describe, expect, it, vi } from "vitest"

import type { BackupService } from "./backup.service"
import { BACKUP_DEFAULT_INTERVAL_MS, BackupScheduler } from "./backup-scheduler"

describe("BackupScheduler", () => {
  afterEach(() => {
    vi.useRealTimers()
    delete process.env.HOSTRIG_BACKUP_DEFAULT_INTERVAL_MS
    delete process.env.HOSTRIG_BACKUP_ALLOW_FAST
  })

  it("registers a schedule and fires run without manual backup API", async () => {
    vi.useFakeTimers()
    const runs: string[] = []
    const backupService = {
      runAll: async (projectId: string) => {
        runs.push(projectId)
        return [
          {
            id: "b1",
            projectId,
            storageKey: "k",
            sizeBytes: 1,
            status: "completed" as const,
          },
        ]
      },
    } as unknown as BackupService

    const scheduler = new BackupScheduler(backupService)
    scheduler.schedule({
      projectId: "proj-1",
      intervalMs: 5_000,
      getTargets: async () =>
        [
          {
            resourceLinkId: "link-1",
            kind: "postgres",
            credentials: {},
            driver: { capabilities: { backup: true } },
          },
        ] as never,
    })

    expect(scheduler.isScheduled("proj-1")).toBe(true)
    expect(runs).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(runs).toEqual(["proj-1"])

    await vi.advanceTimersByTimeAsync(5_000)
    expect(runs).toEqual(["proj-1", "proj-1"])

    scheduler.stopAll()
  })

  it("tick records failure path when backupService.runAll throws", async () => {
    const backupService = {
      runAll: async () => {
        throw new Error("disk full")
      },
    } as unknown as BackupService
    const scheduler = new BackupScheduler(backupService)
    scheduler.schedule({
      projectId: "proj-2",
      intervalMs: 60_000,
      getTargets: async () =>
        [
          {
            resourceLinkId: "link-1",
            kind: "postgres",
            credentials: {},
            driver: { capabilities: { backup: true } },
          },
        ] as never,
    })
    const result = await scheduler.tick("proj-2")
    expect(result).toBe("failed")
    scheduler.stopAll()
  })

  it("normalizeIntervalMs clamps sub-hour demo values to daily", () => {
    expect(BackupScheduler.normalizeIntervalMs(8_000)).toBe(
      BACKUP_DEFAULT_INTERVAL_MS,
    )
    expect(BackupScheduler.normalizeIntervalMs(86_400_000)).toBe(86_400_000)
  })

  it("normalizeIntervalMs keeps short intervals when ALLOW_FAST=1", () => {
    process.env.HOSTRIG_BACKUP_ALLOW_FAST = "1"
    expect(BackupScheduler.normalizeIntervalMs(8_000)).toBe(8_000)
  })

  it("defaultIntervalMs ignores unsafe demo env without ALLOW_FAST", () => {
    process.env.HOSTRIG_BACKUP_DEFAULT_INTERVAL_MS = "8000"
    expect(BackupScheduler.defaultIntervalMs()).toBe(BACKUP_DEFAULT_INTERVAL_MS)
  })
})
