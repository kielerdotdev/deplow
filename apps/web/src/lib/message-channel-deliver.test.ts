import { describe, expect, it, vi, afterEach } from "vitest"

import {
  ChannelDeliverError,
  deliverChannelTest,
} from "./message-channel-deliver"

describe("deliverChannelTest", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
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

  it("posts Slack-shaped JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    })
    vi.stubGlobal("fetch", fetchMock)

    await deliverChannelTest({
      name: "Ops",
      kind: "slack",
      config: { url: "https://hooks.slack.com/services/T/B/x" },
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(init.body as string)).toEqual({
      text: expect.stringContaining("Ops"),
    })
  })

  it("posts Discord content field", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => "",
    })
    vi.stubGlobal("fetch", fetchMock)

    await deliverChannelTest({
      name: "Alerts",
      kind: "discord",
      config: { url: "https://discord.com/api/webhooks/1/token" },
    })

    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(init.body as string)).toEqual({
      content: expect.stringContaining("Alerts"),
    })
  })
})
