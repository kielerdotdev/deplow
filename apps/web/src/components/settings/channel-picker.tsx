import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void client.messageChannels
      .list()
      .then((list) => {
        if (cancelled) return
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
      })
      .catch(() => {
        if (!cancelled) {
          setChannels([])
          setError("Could not load notification channels")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  if (channels.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-xs",
          className,
        )}
      >
        <p className="text-muted-foreground">
          No notification channels yet. Add Slack, Discord, email, or a webhook
          in Settings, then come back.
        </p>
        <Link
          to="/settings/notifications"
          className="mt-2 inline-flex text-foreground underline-offset-2 hover:underline"
        >
          Open Settings → Notifications
        </Link>
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium text-muted-foreground">Notify via</p>
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
    </div>
  )
}
