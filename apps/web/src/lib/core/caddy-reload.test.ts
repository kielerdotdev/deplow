import { describe, expect, it, vi, beforeEach } from "vitest"

import {
  getLastCaddyReload,
  probeCaddyProxy,
  reloadCaddyProxy,
  resetLastCaddyReload,
} from "./caddy-reload"

describe("caddy reload status tracking", () => {
  beforeEach(() => {
    resetLastCaddyReload()
  })

  it("records successful reload", async () => {
    const runCommand = vi.fn(async () => ({
      code: 0,
      stdout: "",
      stderr: "",
    }))
    const result = await reloadCaddyProxy({ runCommand })
    expect(result.ok).toBe(true)
    expect(getLastCaddyReload()?.ok).toBe(true)
    expect(getLastCaddyReload()?.message).toBe("caddy reloaded")
  })

  it("records failed reload without throwing", async () => {
    const runCommand = vi.fn(async () => ({
      code: 1,
      stdout: "",
      stderr: "No such container",
    }))
    const result = await reloadCaddyProxy({ runCommand })
    expect(result.ok).toBe(false)
    expect(result.message).toContain("No such container")
    expect(getLastCaddyReload()?.ok).toBe(false)
  })

  it("probes caddy reachability via docker exec", async () => {
    const runCommand = vi.fn(async () => ({
      code: 0,
      stdout: "deplow proxy",
      stderr: "",
    }))
    const probe = await probeCaddyProxy({ runCommand })
    expect(probe.reachable).toBe(true)
    expect(runCommand).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining([
        "exec",
        "deplow-caddy",
        "wget",
        "http://127.0.0.1:80/deplow-health",
      ]),
    )
  })
})
