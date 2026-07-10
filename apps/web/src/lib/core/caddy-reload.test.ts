import { describe, expect, it, vi } from "vitest"

import { createCaddyReloadOnChange, reloadCaddyProxy } from "./caddy-reload"

describe("reloadCaddyProxy", () => {
  it("runs docker exec caddy reload with config path", async () => {
    const runCommand = vi.fn<
      (
        cmd: string,
        args: string[],
      ) => Promise<{ code: number; stdout: string; stderr: string }>
    >(async () => ({
      code: 0,
      stdout: "",
      stderr: "",
    }))
    const result = await reloadCaddyProxy({
      containerName: "deplow-caddy",
      runCommand,
    })
    expect(result.ok).toBe(true)
    expect(runCommand).toHaveBeenCalledWith("docker", [
      "exec",
      "deplow-caddy",
      "caddy",
      "reload",
      "--config",
      "/etc/caddy/Caddyfile",
      "--adapter",
      "caddyfile",
    ])
  })

  it("returns ok:false without throwing when reload fails", async () => {
    const runCommand = vi.fn<
      (
        cmd: string,
        args: string[],
      ) => Promise<{ code: number; stdout: string; stderr: string }>
    >(async () => ({
      code: 1,
      stdout: "",
      stderr: "container not found",
    }))
    const result = await reloadCaddyProxy({ runCommand })
    expect(result.ok).toBe(false)
    expect(result.message).toContain("container not found")
  })

  it("createCaddyReloadOnChange invokes reload", async () => {
    const runCommand = vi.fn<
      (
        cmd: string,
        args: string[],
      ) => Promise<{ code: number; stdout: string; stderr: string }>
    >(async () => ({
      code: 0,
      stdout: "",
      stderr: "",
    }))
    const onChange = createCaddyReloadOnChange({ runCommand })
    await onChange()
    expect(runCommand).toHaveBeenCalled()
  })
})
