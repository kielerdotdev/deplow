import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { productionSlot, slotResourceName } from "./slot"

describe("provisioning uses production slot naming", () => {
  it("slot helpers produce production resource names from slug", () => {
    const slot = productionSlot("proj-1", "myapp")
    expect(slot.kind).toBe("production")
    expect(slotResourceName(slot)).toBe("myapp")
  })

  it("ProvisioningService marks credentials as production slot", () => {
    const src = readFileSync(
      path.join(import.meta.dirname, "provisioning.service.ts"),
      "utf8",
    )
    expect(src).toContain('slotKind: "production"')
  })
})
