import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

describe("ensureTraefikNotPublic source contract", () => {
  it("patches Traefik Service to ClusterIP and clears nodePorts", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(path.join(dir, "traefik-harden.ts"), "utf8")
    expect(src).toContain('type: "ClusterIP"')
    expect(src).toContain("allocateLoadBalancerNodePorts: undefined")
    expect(src).toContain("delete (next as { nodePort?: number }).nodePort")
  })
})
