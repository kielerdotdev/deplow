import { describe, expect, it } from "vitest"
import { netbirdConnectInputSchema } from "@hostrig/shared"

import {
  buildHttpServicePayload,
  joinApiUrl,
  normalizeManagementUrl,
} from "./client"

describe("netbird client helpers", () => {
  it("normalizes management URL trailing slashes", () => {
    expect(normalizeManagementUrl("https://api.netbird.io/")).toBe(
      "https://api.netbird.io",
    )
    expect(normalizeManagementUrl("https://netbird.waitforit.cc///")).toBe(
      "https://netbird.waitforit.cc",
    )
  })

  it("joins /api paths for cloud and self-hosted bases", () => {
    expect(joinApiUrl("https://api.netbird.io", "/groups")).toBe(
      "https://api.netbird.io/api/groups",
    )
    expect(joinApiUrl("https://api.netbird.io/api", "/peers")).toBe(
      "https://api.netbird.io/api/peers",
    )
    expect(joinApiUrl("https://netbird.waitforit.cc", "setup-keys")).toBe(
      "https://netbird.waitforit.cc/api/setup-keys",
    )
  })

  it("builds HTTP RP payload with peer target and pass_host_header", () => {
    const payload = buildHttpServicePayload({
      name: "whoami.apps.example.com",
      domain: "whoami.apps.example.com",
      peerId: "peer-123",
    })
    expect(payload.mode).toBe("http")
    expect(payload.pass_host_header).toBe(true)
    expect(payload.targets).toEqual([
      {
        target_id: "peer-123",
        target_type: "peer",
        path: "/",
        protocol: "http",
        port: 80,
        enabled: true,
      },
    ])
  })

  it("parses connect schema and normalizes URLs/domains", () => {
    const parsed = netbirdConnectInputSchema.parse({
      managementUrl: "https://api.netbird.io/",
      pat: "nbp_test_token_value",
      domainMode: "managed",
      baseDomain: "Abc.Example.COM.",
    })
    expect(parsed.managementUrl).toBe("https://api.netbird.io")
    expect(parsed.baseDomain).toBe("abc.example.com")
  })
})
