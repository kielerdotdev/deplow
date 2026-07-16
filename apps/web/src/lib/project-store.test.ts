import { describe, expect, it } from "vitest"

import {
  deployPathForProject,
  observePathForProject,
  syncActiveProjectFromPath,
  useProjectStore,
} from "./project-store"

describe("project path helpers", () => {
  it("preserves observe surface when switching projects", () => {
    expect(
      observePathForProject(
        "/observe/projects/aaa/traces",
        "bbb",
      ),
    ).toBe("/observe/projects/bbb/traces")
    expect(
      observePathForProject("/observe/projects/aaa/issues/xyz", "bbb"),
    ).toBe("/observe/projects/bbb/issues")
  })

  it("preserves deploy surface when switching projects", () => {
    expect(deployPathForProject("/projects/aaa/secrets", "bbb")).toBe(
      "/projects/bbb/secrets",
    )
    expect(deployPathForProject("/projects/aaa", "bbb")).toBe(
      "/projects/bbb",
    )
  })
})

describe("syncActiveProjectFromPath", () => {
  it("reads deploy and observe project ids", () => {
    useProjectStore.setState({ activeProjectId: null })
    syncActiveProjectFromPath("/projects/p1/deployments")
    expect(useProjectStore.getState().activeProjectId).toBe("p1")
    syncActiveProjectFromPath("/observe/projects/p2/logs")
    expect(useProjectStore.getState().activeProjectId).toBe("p2")
  })
})
