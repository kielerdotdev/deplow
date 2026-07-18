import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * Unit-level checks for Observe RBAC fail-closed behavior.
 * Mocks DB access used by assertObserveRole.
 */

const { selectMock, fromMock, whereMock, limitMock } = vi.hoisted(() => {
  const limitMock = vi.fn()
  const whereMock = vi.fn(() => ({ limit: limitMock }))
  const fromMock = vi.fn(() => ({ where: whereMock }))
  const selectMock = vi.fn(() => ({ from: fromMock }))
  return { selectMock, fromMock, whereMock, limitMock }
})

vi.mock("@hostrig/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hostrig/db")>()
  return {
    ...actual,
    db: { select: selectMock },
  }
})

import { assertObserveRole } from "./observe-query"

describe("assertObserveRole", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("allows unassigned members as editor for editor minRole", async () => {
    // First select: getObserveProject
    limitMock
      .mockResolvedValueOnce([{ id: "op-1", projectId: "p1" }])
      // Second: observeMembers row missing
      .mockResolvedValueOnce([])
    await expect(
      assertObserveRole("p1", "user-1", "editor"),
    ).resolves.toBeUndefined()
  })

  it("denies unassigned members for admin minRole (fail-closed)", async () => {
    limitMock
      .mockResolvedValueOnce([{ id: "op-1", projectId: "p1" }])
      .mockResolvedValueOnce([])
    await expect(assertObserveRole("p1", "user-1", "admin")).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    )
  })

  it("denies viewer when admin required", async () => {
    limitMock
      .mockResolvedValueOnce([{ id: "op-1", projectId: "p1" }])
      .mockResolvedValueOnce([{ role: "viewer" }])
    await expect(assertObserveRole("p1", "user-1", "admin")).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    )
  })

  it("allows owner for admin minRole", async () => {
    limitMock
      .mockResolvedValueOnce([{ id: "op-1", projectId: "p1" }])
      .mockResolvedValueOnce([{ role: "owner" }])
    await expect(
      assertObserveRole("p1", "user-1", "admin"),
    ).resolves.toBeUndefined()
  })
})
