import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { client } from "@/lib/orpc"

export type ChannelKind = "slack" | "discord" | "webhook" | "email"

const KINDS: { id: ChannelKind; label: string; hint: string }[] = [
  { id: "slack", label: "Slack", hint: "Incoming webhook URL" },
  { id: "discord", label: "Discord", hint: "Webhook URL" },
  { id: "webhook", label: "Webhook", hint: "HTTPS endpoint" },
  { id: "email", label: "Email", hint: "Destination address" },
]

export function AddChannelDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (channel: {
    id: string
    name: string
    kind: ChannelKind
  }) => void
}) {
  const [name, setName] = useState("")
  const [kind, setKind] = useState<ChannelKind>("slack")
  const [url, setUrl] = useState("")
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName("")
    setKind("slack")
    setUrl("")
    setEmail("")
    setError(null)
    setPending(false)
  }, [open])

  async function create() {
    setPending(true)
    setError(null)
    try {
      const result = await client.messageChannels.create({
        name: name.trim() || `${kind} channel`,
        kind,
        config:
          kind === "email" ? { email: email.trim() } : { url: url.trim() },
      })
      onCreated?.({
        id: result.id,
        name: name.trim() || `${kind} channel`,
        kind,
      })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create channel")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" animated={false}>
        <DialogHeader>
          <DialogTitle>Add notification channel</DialogTitle>
          <DialogDescription>
            Connect Slack, Discord, email, or a webhook for Observe alerts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
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
              className="h-9"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="channel-provider">Provider</Label>
            <select
              id="channel-provider"
              name="channel-provider"
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as ChannelKind)}
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
                className="h-9"
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
                className="h-9"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => void create()}
          >
            {pending ? "Saving…" : "Save channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
