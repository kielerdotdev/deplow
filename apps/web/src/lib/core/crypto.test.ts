import { describe, expect, it } from "vitest"

import { decryptString, encryptString, sanitizeIdentifier } from "./crypto"

describe("crypto", () => {
  it("round-trips encrypted strings", () => {
    const secret = "test-secret-key"
    const plain = JSON.stringify({ hello: "world", n: 42 })
    const enc = encryptString(plain, secret)
    expect(enc).not.toContain("hello")
    expect(decryptString(enc, secret)).toBe(plain)
  })

  it("sanitizes identifiers", () => {
    expect(sanitizeIdentifier("My-App!")).toBe("my_app_")
    expect(sanitizeIdentifier("9lives")).toBe("_9lives")
  })
})
