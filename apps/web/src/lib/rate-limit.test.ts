import { afterEach, describe, expect, it } from "vitest"

import {
  clientIpFromRequest,
  consumeRateLimit,
  resetRateLimitsForTests,
} from "./rate-limit"

describe("consumeRateLimit", () => {
  afterEach(() => {
    resetRateLimitsForTests()
  })

  it("allows up to limit hits then blocks", () => {
    const key = "test:a"
    expect(consumeRateLimit(key, 3, 60_000, 1000).ok).toBe(true)
    expect(consumeRateLimit(key, 3, 60_000, 1001).ok).toBe(true)
    expect(consumeRateLimit(key, 3, 60_000, 1002).ok).toBe(true)
    const blocked = consumeRateLimit(key, 3, 60_000, 1003)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  it("resets after window", () => {
    const key = "test:b"
    expect(consumeRateLimit(key, 1, 1000, 0).ok).toBe(true)
    expect(consumeRateLimit(key, 1, 1000, 500).ok).toBe(false)
    expect(consumeRateLimit(key, 1, 1000, 1001).ok).toBe(true)
  })
})

describe("clientIpFromRequest", () => {
  const prev = process.env.HOSTRIG_TRUST_PROXY

  afterEach(() => {
    if (prev === undefined) delete process.env.HOSTRIG_TRUST_PROXY
    else process.env.HOSTRIG_TRUST_PROXY = prev
  })

  it("ignores x-forwarded-for unless HOSTRIG_TRUST_PROXY is set", () => {
    delete process.env.HOSTRIG_TRUST_PROXY
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    })
    expect(clientIpFromRequest(req)).toBe("unknown")
  })

  it("prefers first x-forwarded-for hop when proxy trusted", () => {
    process.env.HOSTRIG_TRUST_PROXY = "1"
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    })
    expect(clientIpFromRequest(req)).toBe("1.2.3.4")
  })
})
