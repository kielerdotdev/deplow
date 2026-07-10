import { describe, expect, it } from "vitest"

import { productionSlot, slotLabel, slotResourceName } from "./slot"

describe("resource slots", () => {
  it("production slot keeps stable slug resource names", () => {
    const slot = productionSlot("pid", "myapp")
    expect(slot.kind).toBe("production")
    expect(slotResourceName(slot)).toBe("myapp")
    expect(slotLabel(slot)).toBe("production")
  })

  it("preview slots suffix resource names without renaming prod", () => {
    const preview = {
      projectId: "pid",
      slug: "myapp",
      kind: "preview" as const,
      previewKey: "pr-42",
    }
    expect(slotResourceName(preview)).toBe("myapp__pr-42")
    expect(slotResourceName(productionSlot("pid", "myapp"))).toBe("myapp")
  })
})
