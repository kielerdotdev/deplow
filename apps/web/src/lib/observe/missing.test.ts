import { describe, expect, it } from "vitest"

import { missingCopy } from "./missing"

describe("missingCopy", () => {
  it("returns actionable detail for frames and traces", () => {
    expect(missingCopy("no_frames").detail.length).toBeGreaterThan(20)
    expect(missingCopy("no_trace").title).toMatch(/trace/i)
    expect(missingCopy("unknown_release").detail).toMatch(/instrumentation/i)
  })
})
