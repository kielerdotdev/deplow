import { describe, expect, it } from "vitest"

import { createDeploymentInputSchema } from "./deploy"

describe("createDeploymentInputSchema", () => {
  it("accepts fromGit without image or sourcePath", () => {
    const result = createDeploymentInputSchema.parse({
      projectId: "proj-1",
      fromGit: true,
    })
    expect(result.fromGit).toBe(true)
    expect(result.projectId).toBe("proj-1")
  })

  it("accepts image-only deploys", () => {
    const result = createDeploymentInputSchema.parse({
      projectId: "proj-1",
      image: "nginx:alpine",
    })
    expect(result.image).toBe("nginx:alpine")
    expect(result.fromGit).toBe(false)
  })

  it("rejects empty deploy without image, sourcePath, or fromGit", () => {
    expect(() =>
      createDeploymentInputSchema.parse({ projectId: "proj-1" }),
    ).toThrow(/image|sourcePath|fromGit/)
  })
})
