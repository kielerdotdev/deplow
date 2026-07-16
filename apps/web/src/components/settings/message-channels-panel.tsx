import { useEffect, useState } from "react"
import { PlusIcon, TrashIcon } from "lucide-react"

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
}: {
  onChannelsChange?: (channels: MessageChannel[]) => void
}) {
  const [channels, setChannels] = useState<MessageChannel[]>([])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<MessageChannel["kind"]>("slack")
  const [url, setUrl] = useState("")
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="space-y-3">
      {channels.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          No notification channels yet. Add Slack, Discord, email, or a generic
          webhook — then assign them to alerts.
        </p>
      ) : null}

      <ul className="space-y-2">
        {channels.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-2 text-sm"
          >
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => void remove(c.id)}
            >
              <TrashIcon className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="space-y-2 rounded-md border border-border/70 p-3">
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ops Slack"
              className="h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Provider</Label>
            <select
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
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8"
              />
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label>{KINDS.find((k) => k.id === kind)?.hint}</Label>
              <Input
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
          onClick={() => setAdding(true)}
        >
          <PlusIcon className="size-3.5" />
          Add channel
        </Button>
      )}
    </div>
  )
}

/** Compact picker for alert dialogs — checkbox list + inline add. */
export function ChannelPicker({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [channels, setChannels] = useState<MessageChannel[]>([])

  return (
    <div className="space-y-2">
      <MessageChannelsPanel onChannelsChange={setChannels} />
      {channels.length > 0 ? (
        <div className="space-y-1 border-t border-border/60 pt-2">
          <p className="text-xs font-medium text-muted-foreground">
            Notify via
          </p>
          {channels.map((c) => {
            const checked = selected.includes(c.id)
            return (
              <label
                key={c.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    onChange(
                      checked
                        ? selected.filter((id) => id !== c.id)
                        : [...selected, c.id],
                    )
                  }}
                />
                {c.name}
                <span className="text-xs text-muted-foreground">({c.kind})</span>
              </label>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
