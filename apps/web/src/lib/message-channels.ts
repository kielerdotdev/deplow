/**
 * Observe notification channel delivery drivers.
 */

import { encryptString, decryptString } from "./core/crypto"
import { safeOutboundFetch } from "./core/safe-fetch"
import { assertSafeOutboundUrl } from "./core/safe-url"

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
const ENC_PREFIX = "enc:v1:"

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

async function postJson(url: string, body: string): Promise<DeliverResult> {
  try {
    // Synchronous policy check first (scheme / hostname shape)
    assertSafeOutboundUrl(url, { allowHttp: false, blockPrivate: true })
  } catch (e) {
    throw new ChannelDeliverError(
      e instanceof Error ? e.message : "Invalid webhook URL",
      "bad_config",
    )
  }
  try {
    // DNS resolve + connect to public IP only (anti DNS-rebinding)
    const res = await safeOutboundFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "hostrig-message-channel/1",
      },
      body,
      timeoutMs: TIMEOUT_MS,
      policy: { allowHttp: false, blockPrivate: true },
    })
    if (!res.ok) {
      throw new ChannelDeliverError(
        `Webhook returned HTTP ${res.status}`,
        "http",
      )
    }
    return { ok: true, status: res.status }
  } catch (error) {
    if (error instanceof ChannelDeliverError) throw error
    const msg = error instanceof Error ? error.message : "Webhook request failed"
    if (/timed out/i.test(msg)) {
      throw new ChannelDeliverError(
        "Webhook timed out after 8s. Check the URL and network path.",
        "network",
      )
    }
    if (/private|local network|resolve/i.test(msg)) {
      throw new ChannelDeliverError(msg, "bad_config")
    }
    throw new ChannelDeliverError(msg, "network")
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
      throw new ChannelDeliverError(
        "Channel is missing a webhook URL.",
        "bad_config",
      )
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
      throw new ChannelDeliverError(
        "Channel is missing a webhook URL.",
        "bad_config",
      )
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
      throw new ChannelDeliverError(
        "Channel is missing a webhook URL.",
        "bad_config",
      )
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
    if (!d)
      throw new ChannelDeliverError(
        `Unsupported channel kind: ${kind}`,
        "unsupported",
      )
    return d
  }
}

let singleton: MessageChannelRegistry | null = null

export function messageChannelRegistry(): MessageChannelRegistry {
  if (!singleton) singleton = new MessageChannelRegistry()
  return singleton
}

/** Encrypt channel config JSON for at-rest storage. */
export function encryptChannelConfigJson(
  config: ChannelConfig,
  secret: string,
): string {
  return ENC_PREFIX + encryptString(JSON.stringify(config), secret)
}

/** Decrypt channel config; supports legacy plaintext JSON. */
export function decryptChannelConfigJson(
  raw: string,
  secret: string,
): ChannelConfig {
  try {
    if (raw.startsWith(ENC_PREFIX)) {
      const plain = decryptString(raw.slice(ENC_PREFIX.length), secret)
      return JSON.parse(plain) as ChannelConfig
    }
    return JSON.parse(raw || "{}") as ChannelConfig
  } catch {
    return {}
  }
}
