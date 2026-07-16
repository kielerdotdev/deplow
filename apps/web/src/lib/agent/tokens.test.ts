import { describe, expect, it } from "vitest"

import {
  generateJoinTokenPlaintext,
  generateNodeTokenPlaintext,
  hashAgentToken,
  isAgentOnline,
} from "./tokens"

describe("agent tokens", () => {
  it("hashes join tokens stably", () => {
    const { token, tokenHash, prefix } = generateJoinTokenPlaintext()
    expect(token.startsWith("dj_")).toBe(true)
    expect(prefix.length).toBe(12)
    expect(hashAgentToken(token)).toBe(tokenHash)
    expect(hashAgentToken(token + "x")).not.toBe(tokenHash)
  })

  it("hashes node tokens stably", () => {
    const { token, tokenHash } = generateNodeTokenPlaintext()
    expect(token.startsWith("dn_")).toBe(true)
    expect(hashAgentToken(token)).toBe(tokenHash)
  })

  it("treats recent agent heartbeats as online", () => {
    expect(
      isAgentOnline({
        provider: "agent",
        lastSeenAt: new Date(),
        status: "online",
      }),
    ).toBe(true)
    expect(
      isAgentOnline({
        provider: "agent",
        lastSeenAt: new Date(Date.now() - 5 * 60_000),
        status: "online",
      }),
    ).toBe(false)
    expect(
      isAgentOnline({
        provider: "docker",
        lastSeenAt: null,
        status: "online",
      }),
    ).toBe(true)
  })
})
