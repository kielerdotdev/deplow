import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { client } from "@/lib/orpc"
import { formatRelative } from "@/lib/observe/format"
import { cn } from "@/lib/utils"

type HistoryRow = {
  id: string
  fromState: string
  toState: string
  value: string | null
  threshold: string | null
  message: string | null
  createdAt: string
}

export function AlertHistoryPanel({
  projectId,
  alertId,
  alertName,
  className,
}: {
  projectId: string
  alertId: string
  alertName?: string
  className?: string
}) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [state, setState] = useState<"loading" | "idle" | "error">("loading")

  useEffect(() => {
    let cancelled = false
    setState("loading")
    void client.observe.alerts
      .history({ projectId, alertId, limit: 40 })
      .then((res) => {
        if (!cancelled) {
          setRows(res)
          setState("idle")
        }
      })
      .catch(() => {
        if (!cancelled) setState("error")
      })
    return () => {
      cancelled = true
    }
  }, [projectId, alertId])

  return (
    <div
      className={cn("rounded-lg border border-border p-3", className)}
      data-testid="alert-history-panel"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          History{alertName ? ` · ${alertName}` : ""}
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setState("loading")
            void client.observe.alerts
              .evaluateNow({ projectId, alertId })
              .then(() =>
                client.observe.alerts.history({ projectId, alertId, limit: 40 }),
              )
              .then((res) => {
                setRows(res)
                setState("idle")
              })
              .catch(() => setState("error"))
          }}
        >
          Evaluate now
        </Button>
      </div>
      {state === "loading" ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : state === "error" ? (
        <p className="text-xs text-destructive">Could not load history</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No transitions yet. The evaluator runs about once a minute.
        </p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-auto text-xs">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 border-b border-border/60 py-1.5 last:border-0"
            >
              <span className="text-muted-foreground tabular-nums">
                {formatRelative(new Date(r.createdAt).getTime())}
              </span>
              <Badge variant="outline" className="font-normal capitalize">
                {r.fromState} → {r.toState}
              </Badge>
              {r.value != null ? (
                <span className="font-mono tabular-nums">
                  {r.value}
                  {r.threshold != null ? ` / ${r.threshold}` : ""}
                </span>
              ) : null}
              {r.message ? (
                <span className="text-muted-foreground">{r.message}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
