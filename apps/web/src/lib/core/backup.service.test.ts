import { afterEach, describe, expect, it, vi } from "vitest"

import {
  BackupService,
  type BackupRecord,
  type BackupStore,
  type BackupTarget,
} from "./backup.service"
import type { DataServiceDriver } from "./data-services"
import type { PlatformConfig } from "./platform-config"

function makeStore(seed: BackupRecord[] = []): BackupStore & {
  rows: BackupRecord[]
} {
  const rows = [...seed]
  return {
    rows,
    async createRunning(
      projectId,
      storageKey,
      kind = "snapshot",
      targetAt = null,
      resourceLinkId = null,
      serviceId = null,
    ) {
      const record: BackupRecord = {
        id: crypto.randomUUID(),
        projectId,
        resourceLinkId,
        serviceId,
        storageKey,
        sizeBytes: 0,
        status: "running",
        kind,
        targetAt,
      }
      rows.unshift(record)
      return record
    },
    async get(id) {
      return rows.find((r) => r.id === id) ?? null
    },
    async complete(id, sizeBytes) {
      const row = rows.find((r) => r.id === id)
      if (row) {
        row.status = "completed"
        row.sizeBytes = sizeBytes
      }
    },
    async fail(id, message) {
      const row = rows.find((r) => r.id === id)
      if (row) {
        row.status = "failed"
        row.errorMessage = message
      }
    },
    async list(projectId, limit = 7) {
      return rows.filter((r) => r.projectId === projectId).slice(0, limit)
    },
    async listExpired(projectId, keep) {
      return rows.filter((r) => r.projectId === projectId).slice(keep)
    },
    async deleteMany(ids) {
      for (const id of ids) {
        const idx = rows.findIndex((r) => r.id === id)
        if (idx >= 0) rows.splice(idx, 1)
      }
    },
    async getLastBackupAt() {
      return new Date()
    },
    async getIntervalMs() {
      return 86_400_000
    },
  }
}

function fakeTarget(linkId = "link1"): BackupTarget {
  const driver = {
    kind: "postgres" as const,
    source: "dedicated-container" as const,
    capabilities: {
      backup: true,
      pitr: true,
      principals: true,
      exportImport: false,
    },
    provision: async () => ({}) as never,
    destroy: async () => undefined,
    backup: {
      backup: async () => ({
        body: Buffer.from("dump"),
        contentType: "application/octet-stream",
        kind: "postgres" as const,
        keySuffix: "postgres.dump",
      }),
      restore: async () => undefined,
    },
  } satisfies DataServiceDriver
  return {
    resourceLinkId: linkId,
    kind: "postgres",
    credentials: {
      host: "h",
      port: 1,
      database: "d",
      user: "u",
      password: "p",
    },
    driver,
  }
}

function testPlatformConfig(): PlatformConfig {
  return {
    backupBucket: "deplow-backups",
    s3: {
      provider: "minio",
      endpoint: "http://127.0.0.1:9000",
      publicEndpoint: "http://127.0.0.1:9000",
      appEndpoint: "http://127.0.0.1:9000",
      accessKeyId: "test",
      secretAccessKey: "test",
      region: "us-east-1",
      backupBucket: "deplow-backups",
    },
  } as PlatformConfig
}

describe("BackupService.prune", () => {
  afterEach(() => {
    delete process.env.DEPLOW_BACKUP_RETAIN
  })

  it("deletes rows beyond the retention window", async () => {
    const projectId = "p1"
    const seed: BackupRecord[] = Array.from({ length: 12 }, (_, i) => ({
      id: `b${i}`,
      projectId,
      storageKey: `projects/${projectId}/postgres-${i}.dump`,
      sizeBytes: 10,
      status: "completed" as const,
      kind: "snapshot" as const,
    }))
    const store = makeStore(seed)
    const deletedKeys: string[] = []

    const service = new BackupService(testPlatformConfig(), store)
    ;(
      service as unknown as {
        storage: { deleteObject: (b: string, key: string) => Promise<void> }
      }
    ).storage = {
      deleteObject: async (_b, key) => {
        deletedKeys.push(key)
      },
    }

    const removed = await service.prune(projectId, 7)
    expect(removed).toBe(5)
    expect(store.rows).toHaveLength(7)
    expect(deletedKeys).toHaveLength(5)
  })

  it("skips a scheduled run when last backup is still fresh", async () => {
    const store = makeStore([
      {
        id: "recent",
        projectId: "p1",
        resourceLinkId: "link1",
        storageKey: "k",
        sizeBytes: 1,
        status: "completed",
      },
    ])
    store.getLastBackupAt = async () => new Date()
    store.getIntervalMs = async () => 86_400_000

    const service = new BackupService(testPlatformConfig(), store)
    const create = vi.spyOn(store, "createRunning")

    const result = await service.run("p1", fakeTarget())

    expect(result.id).toBe("recent")
    expect(create).not.toHaveBeenCalled()
  })
})
