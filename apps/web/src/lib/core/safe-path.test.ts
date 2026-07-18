import path from "node:path"
import { describe, expect, it } from "vitest"

import { resolveContainedPath, resolveRootDirectorySafe } from "./safe-path"

describe("resolveContainedPath", () => {
  const root = "/repo/app"

  it("resolves relative paths under root", () => {
    expect(resolveContainedPath(root, "src")).toBe(path.resolve(root, "src"))
    expect(resolveContainedPath(root, "./docker/Dockerfile")).toBe(
      path.resolve(root, "docker/Dockerfile"),
    )
  })

  it("rejects absolute paths", () => {
    expect(() => resolveContainedPath(root, "/etc/passwd")).toThrow(/relative/)
  })

  it("rejects .. escapes", () => {
    expect(() => resolveContainedPath(root, "../secret")).toThrow(/escapes/)
    expect(() => resolveContainedPath(root, "a/../../secret")).toThrow(/escapes/)
  })

  it("does not allow prefix bypass via sibling names", () => {
    // /repo/app-evil must not count as under /repo/app
    expect(() => resolveContainedPath(root, "../app-evil")).toThrow(/escapes/)
  })
})

describe("resolveRootDirectorySafe", () => {
  it("returns repo root for .", () => {
    expect(resolveRootDirectorySafe("/repo", ".")).toBe(path.resolve("/repo"))
    expect(resolveRootDirectorySafe("/repo", "")).toBe(path.resolve("/repo"))
  })
})
