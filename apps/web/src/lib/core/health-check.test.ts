import { describe, expect, it } from "vitest"

import { extractPortFromLogs, waitForServiceHealth } from "./health-check"

describe("extractPortFromLogs", () => {
  it("parses listening port hints", () => {
    expect(extractPortFromLogs("Server listening on port 3000")).toBe(3000)
    expect(extractPortFromLogs("bound to 0.0.0.0:8080")).toBe(8080)
  })
})

describe("waitForServiceHealth", () => {
  it("succeeds when web port is listening", async () => {
    const result = await waitForServiceHealth({
      serviceType: "web",
      expectedPort: 80,
      timeoutMs: 100,
      intervalMs: 10,
      isPortListening: async () => true,
      isProcessStable: async () => true,
    })
    expect(result).toEqual({ ok: true })
  })

  it("reports wrong port from logs", async () => {
    const result = await waitForServiceHealth({
      serviceType: "web",
      expectedPort: 8080,
      logs: "Server listening on port 3000",
      timeoutMs: 50,
      intervalMs: 10,
      isPortListening: async () => false,
      isProcessStable: async () => true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe(
        "App listens on port 3000 but port 8080 was expected.",
      )
    }
  })

  it("suggests binding to 0.0.0.0 for localhost logs", async () => {
    const result = await waitForServiceHealth({
      serviceType: "web",
      expectedPort: 80,
      logs: "listening on http://localhost:80",
      timeoutMs: 50,
      intervalMs: 10,
      isPortListening: async () => false,
      isProcessStable: async () => true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/0\.0\.0\.0/)
    }
  })

  it("does not treat Astro Local/Network banner as localhost-only", async () => {
    const result = await waitForServiceHealth({
      serviceType: "web",
      expectedPort: 80,
      logs: [
        "astro v4 ready",
        "┃ Local    http://localhost/",
        "┃ Network  http://172.29.0.15/",
      ].join("\n"),
      timeoutMs: 50,
      intervalMs: 10,
      isPortListening: async () => false,
      isProcessStable: async () => true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/Expected port 80/)
      expect(result.message).not.toMatch(/0\.0\.0\.0 instead/)
    }
  })

  it("uses process stability for workers", async () => {
    let checks = 0
    const result = await waitForServiceHealth({
      serviceType: "worker",
      expectedPort: 80,
      timeoutMs: 200,
      intervalMs: 10,
      isPortListening: async () => false,
      isProcessStable: async () => {
        checks++
        return true
      },
    })
    expect(result).toEqual({ ok: true })
    expect(checks).toBeGreaterThanOrEqual(2)
  })

  it("fails workers that never stabilize", async () => {
    const result = await waitForServiceHealth({
      serviceType: "worker",
      expectedPort: 80,
      timeoutMs: 40,
      intervalMs: 10,
      isPortListening: async () => false,
      isProcessStable: async () => false,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/Worker process/)
    }
  })
})
