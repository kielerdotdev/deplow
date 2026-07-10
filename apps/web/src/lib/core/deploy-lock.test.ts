import { describe, expect, it } from "vitest"

import { ProjectDeployLock } from "./deploy-lock"

describe("ProjectDeployLock", () => {
  it("serializes concurrent work for the same project", async () => {
    const lock = new ProjectDeployLock()
    let active = 0
    let maxActive = 0

    async function job(ms: number) {
      return lock.runExclusive("p1", async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, ms))
        active--
        return ms
      })
    }

    // Second starts while first is in flight → should reject, not interleave
    const first = job(40)
    await new Promise((r) => setTimeout(r, 5))
    await expect(job(10)).rejects.toThrow(/another deploy is running/i)
    await expect(first).resolves.toBe(40)
    expect(maxActive).toBe(1)
    expect(lock.isBusy("p1")).toBe(false)
  })

  it("allows different projects in parallel", async () => {
    const lock = new ProjectDeployLock()
    const results = await Promise.all([
      lock.runExclusive("a", async () => "a"),
      lock.runExclusive("b", async () => "b"),
    ])
    expect(results.sort()).toEqual(["a", "b"])
  })

  it("releases lock after failure so retries work", async () => {
    const lock = new ProjectDeployLock()
    await expect(
      lock.runExclusive("p", async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    expect(lock.isBusy("p")).toBe(false)
    await expect(lock.runExclusive("p", async () => "ok")).resolves.toBe("ok")
  })
})
