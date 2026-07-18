/**
 * Outbound delivery for Observe notification channels.
 * Drivers live in message-channels.ts.
 */

export type { ChannelKind, ChannelConfig, DeliverResult } from "./message-channels"
export { ChannelDeliverError } from "./message-channels"
import { messageChannelRegistry, type ChannelConfig, type ChannelKind, type DeliverResult } from "./message-channels"

export async function deliverChannelTest(input: {
  name: string
  kind: ChannelKind
  config: ChannelConfig
}): Promise<DeliverResult> {
  return messageChannelRegistry()
    .get(input.kind)
    .deliverTest({ name: input.name, config: input.config })
}
