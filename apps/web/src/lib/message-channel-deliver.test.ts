import { describe, expect, it, vi, afterEach, beforeEach } from "vitest"

const safeOutboundFetch = vi.fn()

vi.mock("./core/safe-fetch", () => ({
  safeOutboundFetch: (...args: unknown[]) => safeOutboundFetch(...args),
}))

import {
  ChannelDeliverError,
  deliverChannelTest,
} from "./message-channel-deliver"

describe("deliverChannelTest", () => {
  beforeEach(() => {
    safeOutboundFetch.mockReset()
    safeOutboundFetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers(),
      body: Buffer.alloc(0),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("rejects email channels", async () => {
    await expect(
      deliverChannelTest({
        name: "Ops",
        kind: "email",
        config: { email: "ops@example.com" },
      }),
    ).rejects.toMatchObject({
      code: "unsupported",
    } satisfies Partial<ChannelDeliverError>)
  })

  it("posts Slack-shaped JSON via safeOutboundFetch", async () => {
    await deliverChannelTest({
      name: "Ops",
      kind: "slack",
      config: { url: "https://hooks.slack.com/services/T/B/x" },
    })

    expect(safeOutboundFetch).toHaveBeenCalledOnce()
    const [url, init] = safeOutboundFetch.mock.calls[0]!
    expect(url).toContain("hooks.slack.com")
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      text: expect.stringContaining("Ops"),
    })
  })

  it("posts Discord content field", async () => {
    safeOutboundFetch.mockResolvedValue({
      status: 204,
      ok: true,
      headers: new Headers(),
      body: Buffer.alloc(0),
    })

    await deliverChannelTest({
      name: "Alerts",
      kind: "discord",
      config: { url: "https://discord.com/api/webhooks/1/token" },
    })

    const [, init] = safeOutboundFetch.mock.calls[0]!
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      content: expect.stringContaining("Alerts"),
    })
  })

  it("rejects private-network webhook SSRF targets before fetch", async () => {
    await expect(
      deliverChannelTest({
        name: "x",
        kind: "webhook",
        config: { url: "https://127.0.0.1/steal" },
      }),
    ).rejects.toMatchObject({ code: "bad_config" })
    expect(safeOutboundFetch).not.toHaveBeenCalled()
  })

  it("rejects when DNS pin reports private resolution", async () => {
    safeOutboundFetch.mockRejectedValue(
      new Error("Hostname resolves to a private or local network address"),
    )
    await expect(
      deliverChannelTest({
        name: "x",
        kind: "webhook",
        config: { url: "https://example.com/hook" },
      }),
    ).rejects.toMatchObject({ code: "bad_config" })
  })
})
