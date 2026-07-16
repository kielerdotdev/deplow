import { Button } from "@/components/ui/button"
import type { TelemetryAggFn, TelemetryQuery } from "@/lib/observe/telemetry"
import { cn } from "@/lib/utils"

/**
 * Progressive multi-series + formula controls.
 * Defaults to a single series; advanced users add B and a formula like (A/B)*100.
 */
export function ExplorerFormulaBar({
  query,
  onChange,
  className,
}: {
  query: TelemetryQuery
  onChange: (next: TelemetryQuery) => void
  className?: string
}) {
  const series = query.series?.length
    ? query.series
    : [
        {
          id: "A",
          letter: "A",
          label: query.aggregation?.function ?? "count",
          measure: (query.aggregation?.function ?? "count") as TelemetryAggFn,
          field: query.aggregation?.field,
          filters: [] as [],
        },
      ]
  const formulas = query.formulas ?? []

  function ensureSeries() {
    if (query.series?.length) return query
    return {
      ...query,
      series: [
        {
          id: crypto.randomUUID(),
          letter: "A",
          label: query.aggregation?.function ?? "count",
          measure: (query.aggregation?.function ?? "count") as TelemetryAggFn,
          field: query.aggregation?.field,
          filters: [],
        },
      ],
    }
  }

  function addSeries() {
    const base = ensureSeries()
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const used = new Set((base.series ?? []).map((s) => s.letter))
    const letter = letters.split("").find((l) => !used.has(l)) ?? "Z"
    onChange({
      ...base,
      series: [
        ...(base.series ?? []),
        {
          id: crypto.randomUUID(),
          letter,
          label: "count",
          measure: "count" as TelemetryAggFn,
          filters: [],
        },
      ],
    })
  }

  function addErrorRateFormula() {
    const base = ensureSeries()
    let seriesList = base.series ?? []
    if (seriesList.length < 2) {
      seriesList = [
        {
          id: crypto.randomUUID(),
          letter: "A",
          label: "Errors",
          measure: "count" as TelemetryAggFn,
          filters: [{ key: "status", op: "eq" as const, value: "error" }],
        },
        {
          id: crypto.randomUUID(),
          letter: "B",
          label: "All",
          measure: "count" as TelemetryAggFn,
          filters: [],
        },
      ]
    }
    onChange({
      ...base,
      series: seriesList,
      formulas: [
        {
          id: crypto.randomUUID(),
          letter: "C",
          label: "Error %",
          expr: "(A/B)*100",
          unit: "%",
        },
      ],
      presentation: { ...base.presentation, view: "timeseries" },
    })
  }

  function clearAdvanced() {
    onChange({
      ...query,
      series: undefined,
      formulas: undefined,
    })
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border border-border bg-muted/20 px-3 py-2",
        className,
      )}
      data-testid="explorer-formula-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Series & formulas
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={addSeries}>
            Add series
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addErrorRateFormula}
          >
            Error rate formula
          </Button>
          {(query.series || query.formulas) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearAdvanced}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      <ul className="space-y-1 text-xs">
        {series.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2">
            <span className="inline-flex size-5 items-center justify-center rounded bg-muted font-mono text-[10px] font-semibold">
              {s.letter}
            </span>
            <select
              className="min-h-8 rounded border border-border bg-background px-1.5"
              value={s.measure}
              onChange={(e) => {
                const base = ensureSeries()
                onChange({
                  ...base,
                  series: (base.series ?? []).map((row) =>
                    row.id === s.id
                      ? {
                          ...row,
                          measure: e.target.value as TelemetryAggFn,
                          label: e.target.value,
                        }
                      : row,
                  ),
                })
              }}
            >
              {(
                [
                  "count",
                  "rate",
                  "avg",
                  "p50",
                  "p95",
                  "p99",
                  "error_rate",
                ] as TelemetryAggFn[]
              ).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">
              {s.label || s.measure}
            </span>
          </li>
        ))}
        {formulas.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2">
            <span className="inline-flex size-5 items-center justify-center rounded bg-primary/15 font-mono text-[10px] font-semibold text-primary">
              {f.letter}
            </span>
            <input
              className="min-h-8 min-w-[10rem] flex-1 rounded border border-border bg-background px-2 font-mono"
              value={f.expr}
              aria-label={`Formula ${f.letter}`}
              onChange={(e) =>
                onChange({
                  ...query,
                  formulas: formulas.map((row) =>
                    row.id === f.id ? { ...row, expr: e.target.value } : row,
                  ),
                })
              }
            />
            <span className="text-muted-foreground">{f.label ?? "Formula"}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        Example: A = error count, B = all count, formula C = (A/B)*100
      </p>
    </div>
  )
}
