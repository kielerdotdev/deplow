import { describe, expect, it } from "vitest"

import { contentSecurityPolicy, securityHeaders } from "./security-headers"

describe("securityHeaders", () => {
  it("sets baseline headers for UI routes", () => {
    const h = securityHeaders("/projects/x")
    expect(h["X-Content-Type-Options"]).toBe("nosniff")
    expect(h["X-Frame-Options"]).toBe("DENY")
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'")
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
  })

  it("uses a lighter set for Observe ingest paths", () => {
    const h = securityHeaders("/api/3/envelope")
    expect(h["X-Content-Type-Options"]).toBe("nosniff")
    expect(h["Content-Security-Policy"]).toBeUndefined()
  })

  it("builds a non-empty CSP", () => {
    expect(contentSecurityPolicy().length).toBeGreaterThan(20)
  })
})
