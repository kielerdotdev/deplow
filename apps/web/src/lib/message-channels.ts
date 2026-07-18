/**
 * Observe notification channel delivery drivers.
 */

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

const TIMEOUT_MS = 8_000

function testPayload(channelName: string) {
  return {
    event: "channel.test" as const,
    message: `Test notification from Hostrig for “${channelName}”.`,
    sentAt: new Date().toISOString(),
  }
}

export interface MessageChannelDriver {
  readonly kind: ChannelKind
  deliverTest(input: {
    name: string
    config: ChannelConfig
  }): Promise<DeliverResult>
}

async function postJson(
  url: string,
  body: string,
): Promise<DeliverResult> {
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

export class EmailChannelDriver implements MessageChannelDriver {
  readonly kind = "email" as const
  async deliverTest(): Promise<DeliverResult> {
    throw new ChannelDeliverError(
      "Email channels can’t be tested yet — outbound SMTP isn’t configured on this instance.",
      "unsupported",
    )
  }
}

export class SlackChannelDriver implements MessageChannelDriver {
  readonly kind = "slack" as const
  async deliverTest(input: {
    name: string
    config: ChannelConfig
  }): Promise<DeliverResult> {
    const url = input.config.url?.trim()
    if (!url) {
      throw new ChannelDeliverError("Channel is missing a webhook URL.", "bad_config")
    }
    const payload = testPayload(input.name)
    return postJson(url, JSON.stringify({ text: payload.message }))
  }
}

export class DiscordChannelDriver implements MessageChannelDriver {
  readonly kind = "discord" as const
  async deliverTest(input: {
    name: string
    config: ChannelConfig
  }): Promise<DeliverResult> {
    const url = input.config.url?.trim()
    if (!url) {
      throw new ChannelDeliverError("Channel is missing a webhook URL.", "bad_config")
    }
    const payload = testPayload(input.name)
    return postJson(url, JSON.stringify({ content: payload.message }))
  }
}

export class WebhookChannelDriver implements MessageChannelDriver {
  readonly kind = "webhook" as const
  async deliverTest(input: {
    name: string
    config: ChannelConfig
  }): Promise<DeliverResult> {
    const url = input.config.url?.trim()
    if (!url) {
      throw new ChannelDeliverError("Channel is missing a webhook URL.", "bad_config")
    }
    return postJson(url, JSON.stringify(testPayload(input.name)))
  }
}

export class MessageChannelRegistry {
  private readonly drivers: Map<ChannelKind, MessageChannelDriver>

  constructor(drivers?: MessageChannelDriver[]) {
    const list = drivers ?? [
      new EmailChannelDriver(),
      new SlackChannelDriver(),
      new DiscordChannelDriver(),
      new WebhookChannelDriver(),
    ]
    this.drivers = new Map(list.map((d) => [d.kind, d]))
  }

  get(kind: ChannelKind): MessageChannelDriver {
    const d = this.drivers.get(kind)
    if (!d) throw new ChannelDeliverError(`Unsupported channel kind: ${kind}`, "unsupported")
    return d
  }
}

let singleton: MessageChannelRegistry | null = null

export function messageChannelRegistry(): MessageChannelRegistry {
  if (!singleton) singleton = new MessageChannelRegistry()
  return singleton
}
