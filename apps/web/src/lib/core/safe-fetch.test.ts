import { describe, expect, it, vi, afterEach } from "vitest"

import { isPrivateOrLocalHost } from "./safe-url"

// Unit-test resolve logic via re-export of private host check on IPs;
// full DNS pin is covered by resolvePublicAddresses integration when network allows.

describe("private address rejection for DNS pin", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("treats resolved-looking private IPs as private", () => {
    expect(isPrivateOrLocalHost("10.0.0.1")).toBe(true)
    expect(isPrivateOrLocalHost("8.8.8.8")).toBe(false)
  })
})

describe("resolvePublicAddresses", () => {
  it("rejects private literal hosts without DNS", async () => {
    const { resolvePublicAddresses } = await import("./safe-fetch")
    await expect(resolvePublicAddresses("127.0.0.1")).rejects.toThrow(/private/)
    await expect(resolvePublicAddresses("10.1.2.3")).rejects.toThrow(/private/)
  })

  it("accepts public literal IPs", async () => {
    const { resolvePublicAddresses } = await import("./safe-fetch")
    await expect(resolvePublicAddresses("1.1.1.1")).resolves.toEqual(["1.1.1.1"])
  })
})
