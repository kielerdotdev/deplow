import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

/**
 * Source-level guard: Redis requirepass must expand via shell, not literal $(REDIS_PASSWORD).
 */
describe("provisionRedisOnK8s password wiring", () => {
  it("uses sh -c expansion instead of unexpanded $(REDIS_PASSWORD) args", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(path.join(dir, "data.ts"), "utf8")
    expect(src).toContain('command: ["sh", "-c"]')
    expect(src).toContain('exec redis-server --requirepass "$REDIS_PASSWORD"')
    expect(src).not.toMatch(
      /args:\s*\[\s*["']redis-server["']\s*,\s*["']--requirepass["']\s*,\s*["']\$\(REDIS_PASSWORD\)["']/,
    )
  })
})
