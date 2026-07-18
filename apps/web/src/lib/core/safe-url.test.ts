import { describe, expect, it } from "vitest"

import {
  assertSafeGitRemoteUrl,
  assertSafeOutboundUrl,
  isPrivateOrLocalHost,
  isSafeAttributeKey,
} from "./safe-url"

describe("isPrivateOrLocalHost", () => {
  it("flags loopback and RFC1918", () => {
    expect(isPrivateOrLocalHost("127.0.0.1")).toBe(true)
    expect(isPrivateOrLocalHost("10.0.0.5")).toBe(true)
    expect(isPrivateOrLocalHost("192.168.1.1")).toBe(true)
    expect(isPrivateOrLocalHost("169.254.1.1")).toBe(true)
    expect(isPrivateOrLocalHost("0.0.0.0")).toBe(true)
    expect(isPrivateOrLocalHost("::ffff:127.0.0.1")).toBe(true)
    expect(isPrivateOrLocalHost("[::ffff:10.0.0.1]")).toBe(true)
    expect(isPrivateOrLocalHost("metadata.google.internal")).toBe(true)
    expect(isPrivateOrLocalHost("github.com")).toBe(false)
  })
})

describe("assertSafeOutboundUrl", () => {
  it("allows public https webhooks", () => {
    expect(
      assertSafeOutboundUrl("https://hooks.slack.com/services/T/B/x").href,
    ).toContain("hooks.slack.com")
  })

  it("rejects private targets and http by default", () => {
    expect(() =>
      assertSafeOutboundUrl("https://127.0.0.1/hook"),
    ).toThrow(/private/)
    expect(() => assertSafeOutboundUrl("http://example.com/hook")).toThrow(
      /https/,
    )
  })
})

describe("assertSafeGitRemoteUrl", () => {
  it("allows github https", () => {
    expect(assertSafeGitRemoteUrl("https://github.com/acme/api")).toMatch(
      /\.git$/,
    )
  })

  it("rejects file and private hosts", () => {
    expect(() => assertSafeGitRemoteUrl("file:///tmp/repo.git")).toThrow()
    expect(() =>
      assertSafeGitRemoteUrl("https://192.168.0.5/git/repo.git"),
    ).toThrow(/private/)
  })
})

describe("assertSafeGitRemoteUrlResolved", () => {
  it("allows github.com after public DNS pin", async () => {
    const { assertSafeGitRemoteUrlResolved } = await import("./safe-url")
    const url = await assertSafeGitRemoteUrlResolved(
      "https://github.com/acme/api",
    )
    expect(url).toMatch(/github\.com/)
  })

  it("rejects private literal hosts without DNS", async () => {
    const { assertSafeGitRemoteUrlResolved } = await import("./safe-url")
    await expect(
      assertSafeGitRemoteUrlResolved("https://169.254.169.254/repo.git"),
    ).rejects.toThrow(/private/)
  })
})

describe("isSafeAttributeKey", () => {
  it("accepts otel-style keys", () => {
    expect(isSafeAttributeKey("http.status_code")).toBe(true)
    expect(isSafeAttributeKey("service.name")).toBe(true)
  })

  it("rejects injection-shaped keys", () => {
    expect(isSafeAttributeKey("x'] OR 1=1 --")).toBe(false)
  })
})
