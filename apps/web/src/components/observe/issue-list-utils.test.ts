import { describe, expect, it } from "vitest"

import {
  formatIssueCulprit,
  issueLevelTone,
  issueTitlePreview,
} from "./issue-list-utils"

describe("formatIssueCulprit", () => {
  it("shortens absolute monorepo paths to leaf segments", () => {
    expect(
      formatIssueCulprit(
        "/home/user/projects/temp/deplow/apps/web/src/routes/index.tsx:DashboardPage",
      ),
    ).toBe("index.tsx:DashboardPage")
  })

  it("shortens https docs URLs", () => {
    const out = formatIssueCulprit(
      "https://react.dev/link/hydration-mismatch",
    )
    expect(out).toContain("react.dev")
    expect(out).not.toContain("https://")
  })

  it("returns null for empty", () => {
    expect(formatIssueCulprit(null)).toBeNull()
    expect(formatIssueCulprit("  ")).toBeNull()
  })
})

describe("issueTitlePreview", () => {
  it("collapses whitespace and truncates", () => {
    const long = `Error: ${"x".repeat(200)}`
    const out = issueTitlePreview(long, 40)
    expect(out.length).toBeLessThanOrEqual(40)
    expect(out.endsWith("…")).toBe(true)
  })
})

describe("issueLevelTone", () => {
  it("maps error severities", () => {
    expect(issueLevelTone("error")).toBe("error")
    expect(issueLevelTone("FATAL")).toBe("error")
    expect(issueLevelTone("warning")).toBe("warning")
    expect(issueLevelTone("info")).toBe("info")
  })
})
