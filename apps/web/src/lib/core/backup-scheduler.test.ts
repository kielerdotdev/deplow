import { afterEach, describe, expect, it, vi } from "vitest"

import type { BackupService } from "./backup.service"
import { BackupScheduler } from "./backup-scheduler"

describe("BackupScheduler", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("registers a schedule and fires run without manual backup API", async () => {
    vi.useFakeTimers()
    const runs: string[] = []
    const backupService = {
      run: async (projectId: string) => {
        runs.push(projectId)
        return {
          id: "b1",
          projectId,
          storageKey: "k",
          sizeBytes: 1,
          status: "completed" as const,
        }
      },
    } as unknown as BackupService

    const scheduler = new BackupScheduler(backupService)
    scheduler.schedule({
      projectId: "proj-1",
      intervalMs: 5_000,
      getCredentials: async () =>
        ({
          database: {
            host: "h",
            port: 1,
            database: "d",
            user: "u",
            password: "p",
          },
          redis: { host: "h", port: 1 },
          storage: {
            endpoint: "e",
            bucket: "b",
            accessKeyId: "a",
            secretAccessKey: "s",
          },
        }) as never,
    })

    expect(scheduler.isScheduled("proj-1")).toBe(true)
    expect(runs).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(runs).toEqual(["proj-1"])

    await vi.advanceTimersByTimeAsync(5_000)
    expect(runs).toEqual(["proj-1", "proj-1"])

    scheduler.stopAll()
  })

  it("tick records failure path when backupService.run throws", async () => {
    const backupService = {
      run: async () => {
        throw new Error("disk full")
      },
    } as unknown as BackupService
    const scheduler = new BackupScheduler(backupService)
    scheduler.schedule({
      projectId: "proj-2",
      intervalMs: 60_000,
      getCredentials: async () =>
        ({
          database: {
            host: "h",
            port: 1,
            database: "d",
            user: "u",
            password: "p",
          },
          redis: { host: "h", port: 1 },
          storage: {
            endpoint: "e",
            bucket: "b",
            accessKeyId: "a",
            secretAccessKey: "s",
          },
        }) as never,
    })
    const result = await scheduler.tick("proj-2")
    expect(result).toBe("failed")
    scheduler.stopAll()
  })

  it("skips tick when lastBackupAt says not due yet (durable schedule)", async () => {
    const runs: string[] = []
    const backupService = {
      run: async (projectId: string) => {
        runs.push(projectId)
        return {
          id: "b1",
          projectId,
          storageKey: "k",
          sizeBytes: 1,
          status: "completed" as const,
        }
      },
    } as unknown as BackupService

    const scheduler = new BackupScheduler(backupService, { pollMs: 1_000 })
    scheduler.schedule({
      projectId: "proj-3",
      intervalMs: 86_400_000,
      getCredentials: async () =>
        ({
          database: {
            host: "h",
            port: 1,
            database: "d",
            user: "u",
            password: "p",
          },
          redis: { host: "h", port: 1 },
          storage: {
            endpoint: "e",
            bucket: "b",
            accessKeyId: "a",
            secretAccessKey: "s",
          },
        }) as never,
      getLastBackupAt: async () => new Date(), // just now → not due
    })

    expect(await scheduler.tick("proj-3")).toBe("skipped")
    expect(runs).toHaveLength(0)

    // Never backed up → due
    scheduler.unschedule("proj-3")
    scheduler.schedule({
      projectId: "proj-3",
      intervalMs: 86_400_000,
      getCredentials: async () =>
        ({
          database: {
            host: "h",
            port: 1,
            database: "d",
            user: "u",
            password: "p",
          },
          redis: { host: "h", port: 1 },
          storage: {
            endpoint: "e",
            bucket: "b",
            accessKeyId: "a",
            secretAccessKey: "s",
          },
        }) as never,
      getLastBackupAt: async () => null,
    })
    expect(await scheduler.tick("proj-3")).toBe("ok")
    expect(runs).toEqual(["proj-3"])
    scheduler.stopAll()
  })
})
