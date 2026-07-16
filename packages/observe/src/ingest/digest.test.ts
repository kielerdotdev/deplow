import { describe, expect, it, vi, beforeEach } from "vitest"

import { digestEventPayload, type DigestDeps } from "./digest"

function mockDeps(overrides: Partial<DigestDeps> = {}): DigestDeps & {
  inserts: unknown[]
  deleted: Array<{ projectId: string; n: number }>
} {
  const inserts: unknown[] = []
  const deleted: Array<{ projectId: string; n: number }> = []
  let stored = 0
  let order = 0
  return {
    inserts,
    deleted,
    ch: {} as DigestDeps["ch"],
    upsertGrouping: vi.fn(async () => {
      order += 1
      return {
        issueId: "issue-1",
        groupingId: "group-1",
        isNewIssue: order === 1,
        digestOrder: order,
      }
    }),
    bumpIssue: vi.fn(async () => {}),
    bumpHourly: vi.fn(async () => {}),
    getStoredCount: vi.fn(async () => stored),
    setStoredCount: vi.fn(async (_id, count) => {
      stored = count
    }),
    deleteOldestEvents: vi.fn(async (projectId, n) => {
      deleted.push({ projectId, n })
      stored = Math.max(0, stored - n)
    }),
    ...overrides,
  }
}

vi.mock("../clickhouse/events", () => ({
  insertEvent: vi.fn(async (_ch: unknown, row: unknown) => {
    // captured via deps.inserts in tests that replace insertEvent — see below
    void row
  }),
}))

describe("digestEventPayload", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("inserts event and bumps issue", async () => {
    const { insertEvent } = await import("../clickhouse/events")
    const inserted: unknown[] = []
    vi.mocked(insertEvent).mockImplementation(async (_ch, row) => {
      inserted.push(row)
    })

    const deps = mockDeps()
    const result = await digestEventPayload(
      deps,
      {
        projectId: "proj",
        observeProjectId: "op",
        sentryId: 1,
        retentionMaxEventCount: 100,
      },
      {
        event_id: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        message: "boom",
        level: "error",
        exception: { values: [{ type: "Error", value: "boom" }] },
      },
    )

    expect(result.eventId).toBe("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")
    expect(result.issueId).toBe("issue-1")
    expect(inserted).toHaveLength(1)
    expect(deps.bumpIssue).toHaveBeenCalled()
    expect(deps.bumpHourly).toHaveBeenCalled()
    expect(deps.setStoredCount).toHaveBeenCalledWith("op", 1)
    expect(deps.deleted).toHaveLength(0)
  })

  it("evicts when over retention max", async () => {
    const { insertEvent } = await import("../clickhouse/events")
    vi.mocked(insertEvent).mockResolvedValue(undefined)

    const deps = mockDeps({
      getStoredCount: vi.fn(async () => 10),
      setStoredCount: vi.fn(async () => {}),
    })

    await digestEventPayload(
      deps,
      {
        projectId: "proj",
        observeProjectId: "op",
        sentryId: 1,
        retentionMaxEventCount: 10,
      },
      { message: "overflow" },
    )

    expect(deps.deleteOldestEvents).toHaveBeenCalledWith("proj", 1)
  })
})
