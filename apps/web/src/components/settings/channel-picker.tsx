import { useCallback, useEffect, useState } from "react"
import { Loader2Icon, PlusIcon } from "lucide-react"

import { AddChannelDialog } from "@/components/settings/add-channel-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

export type PickerChannel = {
  id: string
  name: string
  kind: "slack" | "discord" | "webhook" | "email"
  enabled: boolean
}

/** Compact channel checklist for alert create/edit — not the full settings panel. */
export function ChannelPicker({
  selected,
  onChange,
  className,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
  className?: string
}) {
  const [channels, setChannels] = useState<PickerChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await client.messageChannels.list()
      setChannels(
        list
          .filter((c) => c.enabled)
          .map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
            enabled: c.enabled,
          })),
      )
      setError(null)
    } catch {
      setChannels([])
      setError("Could not load notification channels")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs text-muted-foreground",
          className,
        )}
      >
        <Loader2Icon className="size-3.5 animate-spin" />
        Loading channels…
      </div>
    )
  }

  if (error) {
    return <p className={cn("text-xs text-destructive", className)}>{error}</p>
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Notify via</p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setAddOpen(true)}
        >
          <PlusIcon className="size-3" />
          Add channel
        </Button>
      </div>

      {channels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-xs">
          <p className="text-muted-foreground">
            No notification channels yet. Add Slack, Discord, email, or a
            webhook to continue.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-2 gap-1"
            onClick={() => setAddOpen(true)}
          >
            <PlusIcon className="size-3.5" />
            Add channel
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border">
          {channels.map((c) => {
            const checked = selected.includes(c.id)
            return (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/40">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      onChange(
                        v === true
                          ? [...selected, c.id]
                          : selected.filter((id) => id !== c.id),
                      )
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {c.name}
                  </span>
                  <span className="shrink-0 text-[11px] capitalize text-muted-foreground">
                    {c.kind}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      <AddChannelDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(channel) => {
          void refresh().then(() => {
            onChange(
              selected.includes(channel.id)
                ? selected
                : [...selected, channel.id],
            )
          })
        }}
      />
    </div>
  )
}
