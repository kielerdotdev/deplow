import { CopyIcon, EyeIcon, EyeOffIcon, PlusIcon, TrashIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  nextSeriesLetter,
  type SeriesDef,
  type TrendsMeasure,
  type TrendsSignal,
} from "@/lib/observe/trends"

const SIGNALS: { id: TrendsSignal; label: string }[] = [
  { id: "spans", label: "Spans" },
  { id: "root_spans", label: "Root spans" },
  { id: "logs", label: "Logs" },
  { id: "errors", label: "Errors" },
]

const MEASURES: { id: TrendsMeasure; label: string; needsField?: boolean }[] = [
  { id: "count", label: "Count" },
  { id: "rate", label: "Rate" },
  { id: "uniq_traces", label: "Unique traces" },
  { id: "error_rate", label: "Error rate" },
  { id: "success_rate", label: "Success rate" },
  { id: "p50", label: "p50", needsField: true },
  { id: "p75", label: "p75", needsField: true },
  { id: "p90", label: "p90", needsField: true },
  { id: "p95", label: "p95", needsField: true },
  { id: "p99", label: "p99", needsField: true },
  { id: "avg", label: "Avg", needsField: true },
  { id: "sum", label: "Sum", needsField: true },
  { id: "min", label: "Min", needsField: true },
  { id: "max", label: "Max", needsField: true },
  { id: "distinct_attr", label: "Distinct", needsField: true },
]

function needsField(m: TrendsMeasure): boolean {
  return (
    MEASURES.find((x) => x.id === m)?.needsField === true ||
    m === "distinct_attr"
  )
}

export function SeriesBuilder({
  series,
  onChange,
}: {
  series: SeriesDef[]
  onChange: (next: SeriesDef[]) => void
}) {
  function update(id: string, patch: Partial<SeriesDef>) {
    onChange(series.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function add() {
    const letter = nextSeriesLetter(series)
    onChange([
      ...series,
      {
        id: crypto.randomUUID(),
        letter,
        label: undefined,
        signal: "spans",
        measure: "rate",
        filters: [],
      },
    ])
  }

  function dup(s: SeriesDef) {
    const letter = nextSeriesLetter(series)
    onChange([
      ...series,
      {
        ...s,
        id: crypto.randomUUID(),
        letter,
        label: s.label ? `${s.label} copy` : undefined,
      },
    ])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Series
        </h4>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={add}>
          <PlusIcon className="size-3.5" />
          Add
        </Button>
      </div>
      {series.map((s) => (
        <div
          key={s.id}
          className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-muted/20 p-2"
        >
          <div className="flex items-center gap-1.5">
            <span className="flex size-6 items-center justify-center rounded bg-muted text-xs font-bold">
              {s.letter}
            </span>
            <Input
              value={s.label ?? ""}
              onChange={(e) =>
                update(s.id, { label: e.target.value || undefined })
              }
              placeholder="Label"
              className="h-7 flex-1 text-xs"
            />
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={s.hidden ? "Show series" : "Hide series"}
              title={s.hidden ? "Show" : "Hide"}
              onClick={() => update(s.id, { hidden: !s.hidden })}
            >
              {s.hidden ? (
                <EyeOffIcon className="size-3.5" />
              ) : (
                <EyeIcon className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Duplicate series"
              title="Duplicate"
              onClick={() => dup(s)}
            >
              <CopyIcon className="size-3.5" />
            </button>
            {series.length > 1 ? (
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Remove series"
                title="Remove"
                onClick={() => onChange(series.filter((x) => x.id !== s.id))}
              >
                <TrashIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <select
              className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
              value={s.signal}
              onChange={(e) =>
                update(s.id, { signal: e.target.value as TrendsSignal })
              }
              aria-label="Signal"
            >
              {SIGNALS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            <select
              className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
              value={s.measure}
              onChange={(e) => {
                const measure = e.target.value as TrendsMeasure
                update(s.id, {
                  measure,
                  field:
                    needsField(measure) && !s.field ? "duration" : s.field,
                })
              }}
              aria-label="Measure"
            >
              {MEASURES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            {needsField(s.measure) ? (
              <Input
                value={s.field ?? ""}
                onChange={(e) =>
                  update(s.id, { field: e.target.value || undefined })
                }
                placeholder="field (duration, attr:…)"
                className="h-7 w-36 text-xs"
              />
            ) : null}
          </div>
          {s.filters.length > 0 ? (
            <p className="text-[10px] text-muted-foreground">
              {s.filters.length} series filter
              {s.filters.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
