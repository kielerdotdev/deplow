import { useEffect, useState } from "react"
import { PlusIcon, SendIcon, TrashIcon } from "lucide-react"

import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { client } from "@/lib/orpc"

export type MessageChannel = {
  id: string
  name: string
  kind: "slack" | "discord" | "webhook" | "email"
  config: { url?: string; email?: string }
  enabled: boolean
}

const KINDS: { id: MessageChannel["kind"]; label: string; hint: string }[] = [
  { id: "slack", label: "Slack", hint: "Incoming webhook URL" },
  { id: "discord", label: "Discord", hint: "Webhook URL" },
  { id: "webhook", label: "Webhook", hint: "HTTPS endpoint" },
  { id: "email", label: "Email", hint: "Destination address" },
]

export function MessageChannelsPanel({
  onChannelsChange,
  pageMode = false,
  startAdding = false,
}: {
  onChannelsChange?: (channels: MessageChannel[]) => void
  /** Full-page manage surface (richer empty state). */
  pageMode?: boolean
  startAdding?: boolean
}) {
  const [channels, setChannels] = useState<MessageChannel[]>([])
  const [adding, setAdding] = useState(startAdding)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<MessageChannel["kind"]>("slack")
  const [url, setUrl] = useState("")
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    }))
    setChannels(mapped)
    onChannelsChange?.(mapped)
  }

  useEffect(() => {
    void refresh().catch(() => setChannels([]))
  }, [])

  async function create() {
    setPending(true)
    setError(null)
    try {
      await client.messageChannels.create({
        name: name.trim() || `${kind} channel`,
        kind,
        config:
          kind === "email"
            ? { email: email.trim() }
            : { url: url.trim() },
      })
      setName("")
      setUrl("")
      setEmail("")
      setAdding(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create")
    } finally {
      setPending(false)
    }
  }

  async function remove(id: string) {
    await client.messageChannels.delete({ id })
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
    } catch (e) {
      setTestMessage({
        id,
        ok: false,
        text: e instanceof Error ? e.message : "Test failed",
      })
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {channels.length === 0 && !adding ? (
        pageMode ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-8">
            <p className="text-sm font-medium">No channels yet</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Add Slack, Discord, email, or a webhook, then assign them when
              creating Observe alerts.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-3 gap-1"
              data-add-channel
              onClick={() => setAdding(true)}
            >
              <PlusIcon className="size-3.5" />
              Add channel
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No notification channels yet. Add Slack, Discord, email, or a generic
            webhook — then assign them to alerts.
          </p>
        )
      ) : null}

      <ul className="space-y-2">
        {channels.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-1.5 rounded-md border border-border/70 px-3 py-2 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.kind}
                  {c.config.url
                    ? ` · ${c.config.url}`
                    : c.config.email
                      ? ` · ${c.config.email}`
                      : ""}
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
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => setRemoveId(c.id)}
                >
                  <TrashIcon className="size-3.5" />
                </Button>
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
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="space-y-2 rounded-md border border-border/70 p-3">
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="channel-name">Name</Label>
            <Input
              id="channel-name"
              name="channel-name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ops Slack"
              className="h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="channel-provider">Provider</Label>
            <select
              id="channel-provider"
              name="channel-provider"
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as MessageChannel["kind"])
              }
            >
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          {kind === "email" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="channel-email">Email</Label>
              <Input
                id="channel-email"
                name="channel-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8"
              />
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="channel-url">
                {KINDS.find((k) => k.id === kind)?.hint}
              </Label>
              <Input
                id="channel-url"
                name="channel-url"
                type="url"
                autoComplete="off"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="h-8"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => void create()}>
              Save channel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          data-add-channel
          onClick={() => setAdding(true)}
        >
          <PlusIcon className="size-3.5" />
          Add channel
        </Button>
      )}

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
