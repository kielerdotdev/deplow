import { describe, expect, it } from "vitest"

import {
  generateMcpTokenPlaintext,
  hashMcpToken,
  parseBearerToken,
} from "./mcp-tokens"

describe("mcp-tokens", () => {
  it("hashes tokens stably", () => {
    const a = hashMcpToken("deplow_test")
    const b = hashMcpToken("deplow_test")
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
  })

  it("generates deplow_ prefixed tokens with matching hash", () => {
    const { token, prefix, tokenHash } = generateMcpTokenPlaintext()
    expect(token.startsWith("deplow_")).toBe(true)
    expect(prefix).toBe(token.slice(0, 12))
    expect(tokenHash).toBe(hashMcpToken(token))
  })

  it("parses Bearer headers", () => {
    expect(parseBearerToken("Bearer abc.def")).toBe("abc.def")
    expect(parseBearerToken("bearer xyz")).toBe("xyz")
    expect(parseBearerToken(null)).toBeNull()
    expect(parseBearerToken("Basic nope")).toBeNull()
  })
})
