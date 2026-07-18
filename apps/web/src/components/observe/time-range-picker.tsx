import { useCallback, useEffect, useState } from "react"
import { ChevronDownIcon, ClockIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import type { TimePreset, TimeRange } from "@/lib/observe/context"
import {
  formatTimeRangeDisplay,
  loadRecentTimeRanges,
  presetLabel,
  pushRecentTimeRange,
  relativeToTimeRange,
  shorthandLabel,
  type RecentTimeRange,
} from "@/lib/observe/time-utils"
import { cn } from "@/lib/utils"

const PRESETS: TimePreset[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "6h",
  "12h",
  "24h",
  "7d",
  "14d",
  "30d",
]

const QUICK: Array<{ label: string; value: string }> = [
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
]

function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputValue(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function TimeRangePicker({
  value,
  onChange,
  hotkey = false,
}: {
  value: TimeRange
  onChange: (next: TimeRange) => void
  /** When true, registers the `D` hotkey via data attribute for GlobalShortcuts. */
  hotkey?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"relative" | "absolute">("relative")
  const [shorthand, setShorthand] = useState("")
  const [shorthandError, setShorthandError] = useState(false)
  const [recent, setRecent] = useState<RecentTimeRange[]>([])
  const [absFrom, setAbsFrom] = useState("")
  const [absTo, setAbsTo] = useState("")

  useEffect(() => {
    setRecent(loadRecentTimeRanges())
  }, [open])

  useEffect(() => {
    if (value.kind === "absolute") {
      setAbsFrom(toLocalInputValue(value.from))
      setAbsTo(toLocalInputValue(value.to))
    }
  }, [value])

  const remember = useCallback((label: string, key: string, range: TimeRange) => {
    setRecent(pushRecentTimeRange({ label, value: key, range }))
  }, [])

  const apply = useCallback(
    (range: TimeRange, label: string, key: string) => {
      onChange(range)
      remember(label, key, range)
      setOpen(false)
      setShorthand("")
      setShorthandError(false)
    },
    [onChange, remember],
  )

  const applyShorthand = useCallback(() => {
    const range = relativeToTimeRange(shorthand)
    if (!range) {
      setShorthandError(true)
      return
    }
    apply(range, shorthandLabel(shorthand), shorthand.trim().toLowerCase())
  }, [shorthand, apply])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            data-testid="observe-time-range-picker"
            data-shortcut-open={hotkey ? "time" : undefined}
          >
            <ClockIcon className="size-3.5 opacity-70" />
            {formatTimeRangeDisplay(value)}
            <ChevronDownIcon
              data-icon="inline-end"
              className="opacity-60"
            />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-3">
        <div className="mb-2 flex gap-1 rounded-md border border-border p-0.5">
          {(
            [
              ["relative", "Relative"],
              ["absolute", "Absolute"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                tab === id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "relative" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md border bg-background/40 pl-3 pr-1.5",
                  shorthandError
                    ? "border-destructive/70"
                    : "border-border/70 focus-within:border-ring",
                )}
              >
                <span className="select-none font-mono text-[11px] text-muted-foreground/70">
                  ›
                </span>
                <input
                  value={shorthand}
                  onChange={(e) => {
                    setShorthand(e.target.value)
                    setShorthandError(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      applyShorthand()
                    }
                  }}
                  placeholder="1m · 2h · 4d · 6w · today"
                  className="flex-1 bg-transparent font-mono text-sm tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <p
                className={cn(
                  "px-1 font-mono text-[10px]",
                  shorthandError
                    ? "text-destructive"
                    : "text-muted-foreground/60",
                )}
              >
                {shorthandError
                  ? "Try 5m, 2h, 4d, 1w, 2mo, or today"
                  : "Type a duration and press enter"}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q.value}
                  type="button"
                  className="h-8 rounded-md border border-border bg-card text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    const range = relativeToTimeRange(q.value)
                    if (range) apply(range, shorthandLabel(q.value), q.value)
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>

            <Separator />

            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
              {PRESETS.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      value.kind === "preset" && value.preset === p
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                    onClick={() =>
                      apply({ kind: "preset", preset: p }, presetLabel(p), p)
                    }
                  >
                    {presetLabel(p)}
                  </button>
                </li>
              ))}
            </ul>

            {recent.length > 0 ? (
              <>
                <Separator />
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Recently used
                  </div>
                  <ul className="space-y-0.5">
                    {recent.map((r) => (
                      <li key={r.value}>
                        <button
                          type="button"
                          className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          onClick={() => {
                            const refreshed =
                              relativeToTimeRange(r.value) ?? r.range
                            apply(refreshed, r.label, r.value)
                          }}
                        >
                          {r.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">From</span>
              <Input
                type="datetime-local"
                value={absFrom}
                onChange={(e) => setAbsFrom(e.target.value)}
                className="font-mono text-xs"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">To</span>
              <Input
                type="datetime-local"
                value={absTo}
                onChange={(e) => setAbsTo(e.target.value)}
                className="font-mono text-xs"
              />
            </label>
            <p className="text-[10px] text-muted-foreground">
              Timezone:{" "}
              <span className="font-mono">
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </span>
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                const from = fromLocalInputValue(absFrom)
                const to = fromLocalInputValue(absTo)
                if (!from || !to) return
                const range: TimeRange = {
                  kind: "absolute",
                  from: from <= to ? from : to,
                  to: from <= to ? to : from,
                }
                apply(range, "Custom range", `custom-${Date.now()}`)
              }}
            >
              Apply range
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
