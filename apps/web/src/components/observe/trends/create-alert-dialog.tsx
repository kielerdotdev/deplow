import { useState } from "react"

import { ChannelPicker } from "@/components/settings/message-channels-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { TrendsQuery } from "@/lib/observe/trends"
import { client } from "@/lib/orpc"

export function CreateAlertFromTrends({
  projectId,
  query,
  onCreated,
  onCancel,
}: {
  projectId: string
  query: TrendsQuery
  onCreated: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(
    query.series[0]?.label
      ? `Alert · ${query.series[0].label}`
      : "Chart alert",
  )
  const [threshold, setThreshold] = useState("0.05")
  const [kind, setKind] = useState<"threshold" | "relative">("threshold")
  const [channelIds, setChannelIds] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (channelIds.length === 0) {
      setError("Pick at least one notification channel")
      return
    }
    setPending(true)
    setError(null)
    try {
      await client.observe.alerts.create({
        projectId,
        name: name.trim() || "Chart alert",
        kind,
        metric: query.series[0]?.measure ?? "error_rate",
        operator: "gt",
        threshold,
        window: "5m",
        channelIds,
        contextJson: JSON.stringify({ trendsQuery: query }),
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create alert")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="surface-panel space-y-3 p-4">
      <div>
        <h3 className="text-sm font-semibold">Alert from this chart</h3>
        <p className="text-xs text-muted-foreground">
          Fires when the primary series crosses the threshold. Delivery goes
          through your notification channels.
        </p>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="grid gap-1.5">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label>Kind</Label>
          <select
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as "threshold" | "relative")
            }
          >
            <option value="threshold">Threshold</option>
            <option value="relative">Baseline-relative</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label>Threshold</Label>
          <Input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="h-8"
          />
        </div>
      </div>
      <ChannelPicker selected={channelIds} onChange={setChannelIds} />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => void create()}>
          Create alert
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
