import { describe, expect, it } from "vitest"

import { createProjectInputSchema } from "./project"

describe("createProjectInputSchema", () => {
  it("accepts a valid project name", () => {
    const result = createProjectInputSchema.parse({ name: "my-app" })
    expect(result).toEqual({ name: "my-app" })
  })

  it("rejects empty names", () => {
    expect(() => createProjectInputSchema.parse({ name: "" })).toThrow()
  })

  it("rejects uppercase names", () => {
    expect(() => createProjectInputSchema.parse({ name: "MyApp" })).toThrow()
  })
})
