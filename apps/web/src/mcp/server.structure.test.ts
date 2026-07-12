import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

describe("mcp server structure", () => {
  it("exposes deploy_from_git and atomic tools", () => {
    const src = readFileSync(path.join(root, "mcp/server.ts"), "utf8")
    expect(src).toContain("deploy_from_git")
    expect(src).toContain("project_create")
    expect(src).toContain("source_analyze")
    expect(src).toContain("service_create_and_deploy")
    expect(src).toContain("deployment_get")
    expect(src).toContain("deployment_logs")
  })

  it("mounts Streamable HTTP at /api/mcp with Bearer gate", () => {
    const src = readFileSync(path.join(root, "routes/api/mcp.ts"), "utf8")
    expect(src).toContain('createFileRoute("/api/mcp")')
    expect(src).toContain("resolveMcpAuthInfo")
    expect(src).toContain("startHTTP")
    expect(src).toContain("toReqRes")
    expect(src).toContain("toFetchResponse")
  })

  it("registers mcp token oRPC routes", () => {
    const src = readFileSync(path.join(root, "orpc/router.ts"), "utf8")
    expect(src).toContain("listTokens")
    expect(src).toContain("createToken")
    expect(src).toContain("revokeToken")
  })
})
