import { useEffect, useState } from "react"

import { ChannelPicker } from "@/components/settings/channel-picker"
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

const WINDOWS = ["1m", "5m", "15m", "1h"] as const
const METRICS = [
  { id: "error_rate", label: "Error rate" },
  { id: "rate", label: "Request rate" },
  { id: "duration_p95", label: "p95 latency" },
  { id: "count", label: "Count" },
] as const

export type CreateAlertDefaults = {
  name?: string
  metric?: string
  threshold?: string
  kind?: "threshold" | "relative"
  window?: (typeof WINDOWS)[number]
  contextJson?: string
}

export function CreateAlertDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
  defaults,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
  defaults?: CreateAlertDefaults
}) {
  const [name, setName] = useState(defaults?.name ?? "Error rate alert")
  const [threshold, setThreshold] = useState(
    defaults?.threshold ??
      (defaults?.metric === "error_rate" || !defaults?.metric ? "0.05" : "100"),
  )
  const [kind, setKind] = useState<"threshold" | "relative">(
    defaults?.kind ?? "threshold",
  )
  const [metric, setMetric] = useState(defaults?.metric ?? "error_rate")
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>(
    defaults?.window ?? "5m",
  )
  const [channelIds, setChannelIds] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(defaults?.name ?? "Error rate alert")
    setMetric(defaults?.metric ?? "error_rate")
    setKind(defaults?.kind ?? "threshold")
    setWindow(defaults?.window ?? "5m")
    setThreshold(
      defaults?.threshold ??
        (defaults?.metric === "error_rate" || !defaults?.metric
          ? "0.05"
          : "100"),
    )
    setChannelIds([])
    setError(null)
    setPending(false)
    // Reset form when the dialog opens; ignore defaults identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-gated reset
  }, [open])

  async function create() {
    if (channelIds.length === 0) {
      setError("Pick at least one notification channel")
      return
    }
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    setPending(true)
    setError(null)
    try {
      await client.observe.alerts.create({
        projectId,
        name: name.trim(),
        kind,
        metric,
        operator: "gt",
        threshold,
        window,
        channelIds,
        contextJson: defaults?.contextJson ?? "{}",
      })
      onCreated?.()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create alert")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" animated={false}>
        <DialogHeader>
          <DialogTitle>Create alert</DialogTitle>
          <DialogDescription>
            Notify when a metric crosses a threshold in the selected window.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="alert-name">Name</Label>
            <Input
              id="alert-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="alert-metric">Metric</Label>
              <select
                id="alert-metric"
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                {METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="alert-kind">Condition</Label>
              <select
                id="alert-kind"
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as "threshold" | "relative")
                }
              >
                <option value="threshold">Above threshold</option>
                <option value="relative">Above previous period</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="alert-threshold">
                {kind === "relative" ? "Delta" : "Threshold"}
              </Label>
              <Input
                id="alert-threshold"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="h-9 font-mono tabular-nums"
                inputMode="decimal"
              />
              <p className="text-[11px] text-muted-foreground">
                {metric === "error_rate"
                  ? "e.g. 0.05 = 5%"
                  : metric.includes("duration")
                    ? "Milliseconds"
                    : "Raw series units"}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="alert-window">Window</Label>
              <select
                id="alert-window"
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={window}
                onChange={(e) =>
                  setWindow(e.target.value as (typeof WINDOWS)[number])
                }
              >
                {WINDOWS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ChannelPicker selected={channelIds} onChange={setChannelIds} />
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
            disabled={pending || channelIds.length === 0}
            onClick={() => void create()}
          >
            {pending ? "Creating…" : "Create alert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
