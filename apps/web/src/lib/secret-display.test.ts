import { describe, expect, it } from "vitest"

import { maskEmail, maskSecret } from "./secret-display"

describe("maskSecret", () => {
  it("keeps a short suffix", () => {
    expect(maskSecret("https://discord.com/api/webhooks/123/abcwndnK", 5)).toBe(
      "••••••••••••••••wndnK",
    )
  })
})

describe("maskEmail", () => {
  it("masks the local part", () => {
    expect(maskEmail("teammate@example.com")).toMatch(/^te•+@example\.com$/)
  })
})
