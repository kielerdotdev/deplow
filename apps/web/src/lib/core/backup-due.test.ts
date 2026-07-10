import { describe, expect, it } from "vitest"

import { isBackupDue, nextBackupDueAt } from "./backup-due"

describe("isBackupDue", () => {
  const interval = 60_000
  const now = new Date("2026-01-01T12:00:00.000Z")

  it("is due when never backed up", () => {
    expect(isBackupDue({ lastBackupAt: null, intervalMs: interval, now })).toBe(
      true,
    )
    expect(
      isBackupDue({ lastBackupAt: undefined, intervalMs: interval, now }),
    ).toBe(true)
  })

  it("is not due until interval elapses", () => {
    const last = new Date("2026-01-01T11:59:30.000Z") // 30s ago
    expect(isBackupDue({ lastBackupAt: last, intervalMs: interval, now })).toBe(
      false,
    )
  })

  it("is due after interval elapses", () => {
    const last = new Date("2026-01-01T11:58:00.000Z") // 2m ago
    expect(isBackupDue({ lastBackupAt: last, intervalMs: interval, now })).toBe(
      true,
    )
  })

  it("accepts ISO string lastBackupAt", () => {
    expect(
      isBackupDue({
        lastBackupAt: "2026-01-01T10:00:00.000Z",
        intervalMs: interval,
        now,
      }),
    ).toBe(true)
  })

  it("disabled when intervalMs <= 0", () => {
    expect(isBackupDue({ lastBackupAt: null, intervalMs: 0, now })).toBe(false)
  })

  it("nextBackupDueAt is last + interval", () => {
    const last = new Date("2026-01-01T11:00:00.000Z")
    expect(
      nextBackupDueAt({ lastBackupAt: last, intervalMs: interval, now }),
    ).toBe(last.getTime() + interval)
  })
})
