import { describe, expect, it } from "vitest"

import { getServiceTemplate, SERVICE_TEMPLATES } from "./service-templates"

describe("service templates", () => {
  it("includes whoami as the default hello-world image", () => {
    const whoami = getServiceTemplate("whoami")
    expect(whoami?.kind).toBe("image")
    if (whoami?.kind === "image") {
      expect(whoami.image).toContain("whoami")
      expect(whoami.containerPort).toBe(80)
    }
  })

  it("includes postgres and redis data templates", () => {
    expect(SERVICE_TEMPLATES.some((t) => t.id === "postgres")).toBe(true)
    expect(SERVICE_TEMPLATES.some((t) => t.id === "redis")).toBe(true)
  })

  it("uses valid service names", () => {
    for (const t of SERVICE_TEMPLATES) {
      expect(t.name).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
    }
  })
})
