import { cn } from "@/lib/utils"
import type { TrendsResult } from "@/lib/observe/trends"

export function ResultTable({
  result,
  hiddenKeys,
  onToggleKey,
}: {
  result: TrendsResult
  hiddenKeys: Set<string>
  onToggleKey: (key: string) => void
}) {
  const keys = result.seriesMeta.filter((m) => !m.isBaseline).map((m) => m.key)
  const visibleKeys = keys.filter((k) => !hiddenKeys.has(k))

  if (result.histogram) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground">
              <th className="px-2 py-1.5 font-medium">Bin</th>
              <th className="px-2 py-1.5 font-medium">Count</th>
            </tr>
          </thead>
          <tbody>
            {result.histogram.map((h) => (
              <tr key={h.bin} className="border-b border-border/40">
                <td className="px-2 py-1 tabular-nums">{h.bin}</td>
                <td className="px-2 py-1 tabular-nums">{h.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (result.number) {
    return (
      <div className="text-sm tabular-nums">
        Value: <strong>{result.number.value.toFixed(3)}</strong>
        {result.number.unit ? ` ${result.number.unit}` : ""}
        {result.number.baseline != null ? (
          <span className="ml-3 text-muted-foreground">
            Baseline: {result.number.baseline.toFixed(3)}
          </span>
        ) : null}
      </div>
    )
  }

  const totals: Record<string, number> = {}
  for (const k of visibleKeys) totals[k] = 0
  for (const p of result.points) {
    for (const k of visibleKeys) {
      const v = p.values[k]
      if (v != null) totals[k] = (totals[k] ?? 0) + v
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {result.seriesMeta.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onToggleKey(m.key)}
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[10px]",
              hiddenKeys.has(m.key)
                ? "border-border/40 text-muted-foreground line-through"
                : "border-border/70 bg-muted/40",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="max-h-64 overflow-auto">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border/60 text-muted-foreground">
              <th className="px-2 py-1.5 font-medium">Time</th>
              {visibleKeys.map((k) => {
                const meta = result.seriesMeta.find((m) => m.key === k)
                return (
                  <th key={k} className="px-2 py-1.5 font-medium">
                    {meta?.label ?? k}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {result.points.map((p) => (
              <tr key={p.t} className="border-b border-border/40">
                <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">
                  {new Date(p.t).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: result.intervalSec < 60 ? "2-digit" : undefined,
                  })}
                </td>
                {visibleKeys.map((k) => {
                  const v = p.values[k]
                  return (
                    <td key={k} className="px-2 py-1 tabular-nums">
                      {v == null ? "—" : formatVal(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="border-t border-border/60 font-medium">
              <td className="px-2 py-1.5">Total / Σ</td>
              {visibleKeys.map((k) => (
                <td key={k} className="px-2 py-1.5 tabular-nums">
                  {formatVal(totals[k] ?? 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatVal(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(1)
  if (Math.abs(v) >= 10) return v.toFixed(2)
  return v.toFixed(4).replace(/\.?0+$/, "") || "0"
}
