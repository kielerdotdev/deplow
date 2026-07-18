import { describe, expect, it } from "vitest"

import { resolveRailpackBin } from "./railpack-bin"

describe("resolveRailpackBin", () => {
  it("skips a missing RAILPACK_BIN and finds an installed binary", () => {
    const bin = resolveRailpackBin({
      ...process.env,
      RAILPACK_BIN: "/nope/railpack",
    })
    expect(bin).toMatch(/railpack$/)
    expect(bin).not.toBe("/nope/railpack")
  })
})
