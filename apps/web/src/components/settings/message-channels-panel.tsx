import { useEffect, useState } from "react"
import {
  EllipsisIcon,
  PlusIcon,
  SendIcon,
} from "lucide-react"

import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import { AddChannelDialog } from "@/components/settings/add-channel-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { client } from "@/lib/orpc"
import { formatRelativeTime } from "@/lib/ui-format"
import { cn } from "@/lib/utils"

export type MessageChannel = {
  id: string
  name: string
  kind: "slack" | "discord" | "webhook" | "email"
  config: { urlMasked?: string; emailMasked?: string }
  enabled: boolean
  lastTestedAt: string | null
  lastTestOk: boolean | null
  lastDeliveryAt: string | null
  lastDeliveryOk: boolean | null
  lastError: string | null
}

const KIND_LABEL: Record<MessageChannel["kind"], string> = {
  slack: "Slack",
  discord: "Discord",
  webhook: "Webhook",
  email: "Email",
}

export function MessageChannelsPanel({
  onChannelsChange,
  pageMode = false,
  startAdding = false,
  addOpen: addOpenControlled,
  onAddOpenChange,
}: {
  onChannelsChange?: (channels: MessageChannel[]) => void
  /** Full-page manage surface (richer empty state). */
  pageMode?: boolean
  startAdding?: boolean
  /** Controlled open state for the add-channel modal (e.g. page header). */
  addOpen?: boolean
  onAddOpenChange?: (open: boolean) => void
}) {
  const [channels, setChannels] = useState<MessageChannel[]>([])
  const [addOpenUncontrolled, setAddOpenUncontrolled] = useState(startAdding)
  const addOpen = addOpenControlled ?? addOpenUncontrolled
  const setAddOpen = onAddOpenChange ?? setAddOpenUncontrolled
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState<{
    id: string
    ok: boolean
    text: string
  } | null>(null)

  async function refresh() {
    const list = await client.messageChannels.list()
    const mapped = list.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      config: c.config as MessageChannel["config"],
      enabled: c.enabled,
      lastTestedAt: c.lastTestedAt ?? null,
      lastTestOk: c.lastTestOk ?? null,
      lastDeliveryAt: c.lastDeliveryAt ?? null,
      lastDeliveryOk: c.lastDeliveryOk ?? null,
      lastError: c.lastError ?? null,
    }))
    setChannels(mapped)
    onChannelsChange?.(mapped)
  }

  useEffect(() => {
    void refresh().catch(() => setChannels([]))
  }, [])

  async function remove(id: string) {
    await client.messageChannels.delete({ id })
    await refresh()
  }

  async function setEnabled(id: string, enabled: boolean) {
    await client.messageChannels.update({ id, enabled })
    await refresh()
  }

  async function testChannel(id: string) {
    setTestingId(id)
    setTestMessage(null)
    try {
      await client.messageChannels.test({ id })
      setTestMessage({
        id,
        ok: true,
        text: "Test sent — check the destination.",
      })
      await refresh()
    } catch (e) {
      setTestMessage({
        id,
        ok: false,
        text: e instanceof Error ? e.message : "Test failed",
      })
      await refresh().catch(() => undefined)
    } finally {
      setTestingId(null)
    }
  }

  function deliverySummary(c: MessageChannel): string {
    if (c.lastTestedAt) {
      const when = formatRelativeTime(c.lastTestedAt)
      if (c.lastTestOk === true) return `Last tested ${when} · Successful`
      if (c.lastTestOk === false) return `Last tested ${when} · Failed`
      return `Last tested ${when}`
    }
    if (c.lastDeliveryAt) {
      const when = formatRelativeTime(c.lastDeliveryAt)
      return c.lastDeliveryOk
        ? `Last delivery ${when} · Successful`
        : `Last delivery ${when} · Failed`
    }
    return "Never tested"
  }

  return (
    <div className="space-y-4">
      {channels.length === 0 ? (
        pageMode ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/15 px-5 py-8">
            <p className="text-sm font-medium">No channels yet</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Add Slack, Discord, email, or a webhook, then assign them when
              creating Observe alerts.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-4 gap-1"
              onClick={() => setAddOpen(true)}
            >
              <PlusIcon className="size-3.5" />
              Add channel
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No notification channels yet. Add Slack, Discord, email, or a
            generic webhook — then assign them to alerts.
          </p>
        )
      ) : null}

      {channels.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {channels.map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex flex-col gap-2 px-5 py-3.5 text-sm",
                !c.enabled && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{c.name}</p>
                    {!c.enabled ? (
                      <span className="text-[11px] text-muted-foreground">
                        Disabled
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {KIND_LABEL[c.kind]}
                    {c.config.urlMasked
                      ? ` · ${c.config.urlMasked}`
                      : c.config.emailMasked
                        ? ` · ${c.config.emailMasked}`
                        : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {deliverySummary(c)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={testingId === c.id}
                    aria-label={`Send test to ${c.name}`}
                    onClick={() => void testChannel(c.id)}
                  >
                    <SendIcon className="size-3.5" />
                    {testingId === c.id ? "Sending…" : "Test"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`${c.name} actions`}
                        />
                      }
                    >
                      <EllipsisIcon className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      <DropdownMenuItem
                        onClick={() => void setEnabled(c.id, !c.enabled)}
                      >
                        {c.enabled ? "Disable" : "Enable"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setRemoveId(c.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {testMessage?.id === c.id ? (
                <p
                  className={
                    testMessage.ok
                      ? "text-xs text-success"
                      : "text-xs text-destructive"
                  }
                  role="status"
                >
                  {testMessage.text}
                </p>
              ) : null}
              {c.lastError && c.lastTestOk === false ? (
                <p className="text-xs text-destructive">{c.lastError}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!pageMode ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => setAddOpen(true)}
        >
          <PlusIcon className="size-3.5" />
          Add channel
        </Button>
      ) : null}

      <AddChannelDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => {
          void refresh()
        }}
      />

      <ConfirmActionDialog
        open={!!removeId}
        onOpenChange={(open) => {
          if (!open) setRemoveId(null)
        }}
        title="Remove channel"
        description={
          removeId
            ? `Remove “${channels.find((c) => c.id === removeId)?.name ?? "this channel"}”? Alerts using it will stop notifying this destination.`
            : "Remove this channel?"
        }
        confirmLabel="Remove channel"
        onConfirm={async () => {
          if (!removeId) return
          await remove(removeId)
        }}
      />
    </div>
  )
}

export { ChannelPicker } from "@/components/settings/channel-picker"
