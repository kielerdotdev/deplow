/**
 * Outbound delivery for Observe notification channels (Slack / Discord / webhook).
 * Email is stored as a destination but has no SMTP sender in v1.
 */

const TIMEOUT_MS = 8_000

export type ChannelKind = "slack" | "discord" | "webhook" | "email"

export type ChannelConfig = {
  url?: string
  email?: string
}

export type DeliverResult = {
  ok: true
  status: number
}

export class ChannelDeliverError extends Error {
  constructor(
    message: string,
    readonly code: "unsupported" | "bad_config" | "http" | "network" = "http",
  ) {
    super(message)
    this.name = "ChannelDeliverError"
  }
}

function testPayload(channelName: string) {
  return {
    event: "channel.test" as const,
    message: `Test notification from deplow for “${channelName}”.`,
    sentAt: new Date().toISOString(),
  }
}

export async function deliverChannelTest(input: {
  name: string
  kind: ChannelKind
  config: ChannelConfig
}): Promise<DeliverResult> {
  const { name, kind, config } = input

  if (kind === "email") {
    throw new ChannelDeliverError(
      "Email channels can’t be tested yet — outbound SMTP isn’t configured on this instance.",
      "unsupported",
    )
  }

  const url = config.url?.trim()
  if (!url) {
    throw new ChannelDeliverError("Channel is missing a webhook URL.", "bad_config")
  }

  const payload = testPayload(name)
  let body: string
  if (kind === "slack") {
    body = JSON.stringify({ text: payload.message })
  } else if (kind === "discord") {
    body = JSON.stringify({ content: payload.message })
  } else {
    body = JSON.stringify(payload)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "deplow-message-channel/1",
      },
      body,
      signal: controller.signal,
    })
    if (!res.ok) {
      const snippet = (await res.text().catch(() => "")).slice(0, 160)
      throw new ChannelDeliverError(
        `Webhook returned HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`,
        "http",
      )
    }
    return { ok: true, status: res.status }
  } catch (error) {
    if (error instanceof ChannelDeliverError) throw error
    if (error instanceof Error && error.name === "AbortError") {
      throw new ChannelDeliverError(
        "Webhook timed out after 8s. Check the URL and network path.",
        "network",
      )
    }
    throw new ChannelDeliverError(
      error instanceof Error ? error.message : "Webhook request failed",
      "network",
    )
  } finally {
    clearTimeout(timer)
  }
}
