import { describe, expect, it } from "vitest"

import { THEME_BOOT_SCRIPT, resolveTheme } from "./theme"

describe("theme", () => {
  it("defaults to dark product theme", () => {
    expect(resolveTheme(null)).toBe("dark")
  })

  it("honors stored preference", () => {
    expect(resolveTheme("dark")).toBe("dark")
    expect(resolveTheme("light")).toBe("light")
  })

  it("boot script references storage key and dark class", () => {
    expect(THEME_BOOT_SCRIPT).toContain("hostrig.theme")
    expect(THEME_BOOT_SCRIPT).toContain("classList.toggle")
    expect(THEME_BOOT_SCRIPT).toContain('"dark"')
  })
})
