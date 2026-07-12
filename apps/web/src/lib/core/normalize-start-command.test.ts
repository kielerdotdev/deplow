import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { normalizeProductionStartCommand } from "./normalize-start-command"

describe("normalizeProductionStartCommand", () => {
  it("rewrites astro dev via package start script", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "deplow-astro-start-"))
    try {
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({
          scripts: {
            start: "astro dev",
            preview: "astro preview",
            build: "astro build",
          },
        }),
      )
      expect(normalizeProductionStartCommand("bun run start", dir)).toBe(
        "astro preview --host 0.0.0.0 --port ${PORT}",
      )
      expect(normalizeProductionStartCommand("astro dev", dir)).toBe(
        "astro preview --host 0.0.0.0 --port ${PORT}",
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("leaves production start commands alone", () => {
    expect(normalizeProductionStartCommand("node server.js")).toBe(
      "node server.js",
    )
    expect(normalizeProductionStartCommand("next start")).toBe("next start")
    expect(
      normalizeProductionStartCommand(
        "astro preview --host 0.0.0.0 --port ${PORT}",
      ),
    ).toBe("astro preview --host 0.0.0.0 --port ${PORT}")
  })

  it("rewrites railpack caddy default to astro preview", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "deplow-astro-caddy-"))
    try {
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({
          scripts: {
            build: "astro build",
            preview: "astro preview",
            dev: "astro dev",
          },
        }),
      )
      expect(
        normalizeProductionStartCommand(
          "caddy run --config /Caddyfile --adapter caddyfile 2>&1",
          dir,
        ),
      ).toBe("astro preview --host 0.0.0.0 --port ${PORT}")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("drops railpack caddy when there is no app preview (use image default)", () => {
    expect(
      normalizeProductionStartCommand(
        "caddy run --config /Caddyfile --adapter caddyfile 2>&1",
      ),
    ).toBeNull()
  })
})
