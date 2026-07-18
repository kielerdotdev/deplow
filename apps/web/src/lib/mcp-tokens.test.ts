import { describe, expect, it } from "vitest"

import { isReadOnlyMcpToken } from "./mcp-tokens"
import type { Session } from "./auth"

function sessionWithScopes(scopes?: Array<"*" | "read">): Session {
  return {
    user: {
      id: "u1",
      name: "t",
      email: "t@example.com",
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      instanceAdmin: false,
    },
    session: {
      id: "mcp:1",
      token: "mcp:1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    },
    mcpScopes: scopes,
  } as Session
}

describe("isReadOnlyMcpToken", () => {
  it("is false for cookie sessions and full tokens", () => {
    expect(isReadOnlyMcpToken(sessionWithScopes(undefined))).toBe(false)
    expect(isReadOnlyMcpToken(sessionWithScopes(["*"]))).toBe(false)
    expect(isReadOnlyMcpToken(sessionWithScopes(["*", "read"]))).toBe(false)
  })

  it("is true for read-only tokens", () => {
    expect(isReadOnlyMcpToken(sessionWithScopes(["read"]))).toBe(true)
  })
})
