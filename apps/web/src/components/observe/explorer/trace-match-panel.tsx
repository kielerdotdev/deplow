import { Button } from "@/components/ui/button"
import type { TelemetryQuery } from "@/lib/observe/telemetry"
import { cn } from "@/lib/utils"

type Relation = NonNullable<TelemetryQuery["traceMatch"]>["relation"]

const RELATIONS: Array<{ id: Relation; label: string; hint: string }> = [
  {
    id: "same_trace",
    label: "Same trace",
    hint: "Traces containing both A and B",
  },
  {
    id: "child",
    label: "Direct child",
    hint: "B is a direct child of A",
  },
  {
    id: "descendant",
    label: "Descendant",
    hint: "A is an ancestor of B (approx.)",
  },
  {
    id: "exclude",
    label: "Exclude B",
    hint: "Match A but not B",
  },
]

/** Collapsible A → B trace relationship query. */
export function ExplorerTraceMatchPanel({
  query,
  onChange,
  className,
}: {
  query: TelemetryQuery
  onChange: (next: TelemetryQuery) => void
  className?: string
}) {
  const tm = query.traceMatch
  const enabled = !!tm

  function enable() {
    onChange({
      ...query,
      presentation: { ...query.presentation, view: "traces" },
      traceMatch: {
        relation: "same_trace",
        patternA: { service: "" },
        patternB: { service: "", statusError: true },
      },
    })
  }

  function disable() {
    onChange({ ...query, traceMatch: undefined })
  }

  if (!enabled) {
    return (
      <div className={cn("rounded-md border border-dashed border-border px-3 py-2", className)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium">Trace matching</div>
            <p className="text-[11px] text-muted-foreground">
              Find traces where pattern A relates to pattern B (e.g. frontend →
              failed payments).
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={enable}>
            Enable
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border border-border bg-muted/20 px-3 py-2",
        className,
      )}
      data-testid="explorer-trace-match"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Trace match A → B
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={disable}>
          Disable
        </Button>
      </div>

      <label className="block text-[11px] text-muted-foreground">
        Relation
        <select
          className="mt-1 block min-h-8 w-full rounded border border-border bg-background px-2 text-xs"
          value={tm.relation}
          onChange={(e) =>
            onChange({
              ...query,
              traceMatch: {
                ...tm,
                relation: e.target.value as Relation,
              },
            })
          }
        >
          {RELATIONS.map((r) => (
            <option key={r.id} value={r.id} title={r.hint}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <fieldset className="space-y-1.5 rounded border border-border/80 p-2">
          <legend className="px-1 text-[11px] font-medium">A</legend>
          <input
            className="min-h-8 w-full rounded border border-border bg-background px-2 text-xs"
            placeholder="service"
            value={tm.patternA.service ?? ""}
            onChange={(e) =>
              onChange({
                ...query,
                traceMatch: {
                  ...tm,
                  patternA: { ...tm.patternA, service: e.target.value || undefined },
                },
              })
            }
          />
          <input
            className="min-h-8 w-full rounded border border-border bg-background px-2 text-xs"
            placeholder="operation"
            value={tm.patternA.operation ?? ""}
            onChange={(e) =>
              onChange({
                ...query,
                traceMatch: {
                  ...tm,
                  patternA: {
                    ...tm.patternA,
                    operation: e.target.value || undefined,
                  },
                },
              })
            }
          />
        </fieldset>
        <fieldset className="space-y-1.5 rounded border border-border/80 p-2">
          <legend className="px-1 text-[11px] font-medium">B</legend>
          <input
            className="min-h-8 w-full rounded border border-border bg-background px-2 text-xs"
            placeholder="service"
            value={tm.patternB.service ?? ""}
            onChange={(e) =>
              onChange({
                ...query,
                traceMatch: {
                  ...tm,
                  patternB: { ...tm.patternB, service: e.target.value || undefined },
                },
              })
            }
          />
          <input
            className="min-h-8 w-full rounded border border-border bg-background px-2 text-xs"
            placeholder="operation"
            value={tm.patternB.operation ?? ""}
            onChange={(e) =>
              onChange({
                ...query,
                traceMatch: {
                  ...tm,
                  patternB: {
                    ...tm.patternB,
                    operation: e.target.value || undefined,
                  },
                },
              })
            }
          />
          <label className="flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              checked={!!tm.patternB.statusError}
              onChange={(e) =>
                onChange({
                  ...query,
                  traceMatch: {
                    ...tm,
                    patternB: {
                      ...tm.patternB,
                      statusError: e.target.checked || undefined,
                    },
                  },
                })
              }
            />
            Errors only
          </label>
        </fieldset>
      </div>
    </div>
  )
}
