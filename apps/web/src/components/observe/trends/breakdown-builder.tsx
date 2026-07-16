import { useState } from "react"
import { PlusIcon, TrashIcon } from "lucide-react"

import { FieldAutocomplete } from "@/components/observe/field-autocomplete"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { BreakdownDef } from "@/lib/observe/trends"

export function BreakdownBuilder({
  projectId,
  breakdowns,
  onChange,
}: {
  projectId: string
  breakdowns: BreakdownDef[]
  onChange: (next: BreakdownDef[]) => void
}) {
  const [open, setOpen] = useState(breakdowns.length > 0)

  if (!open && breakdowns.length === 0) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => {
          setOpen(true)
          onChange([
            {
              field: "service",
              topN: 25,
              rankBy: "count",
              otherBucket: true,
            },
          ])
        }}
      >
        + Breakdown
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Breakdown
        </h4>
        {breakdowns.length === 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2"
            onClick={() =>
              onChange([
                {
                  field: "service",
                  topN: 25,
                  rankBy: "count",
                  otherBucket: true,
                },
              ])
            }
          >
            <PlusIcon className="size-3.5" />
            Add
          </Button>
        ) : null}
      </div>
      {breakdowns.map((b, i) => (
        <div
          key={i}
          className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-muted/20 p-2"
        >
          <div className="flex items-center gap-1.5">
            <FieldAutocomplete
              projectId={projectId}
              mode="fields"
              value={b.field}
              onChange={(field) => {
                const next = [...breakdowns]
                next[i] = { ...b, field }
                onChange(next)
              }}
              placeholder="service, attr:…"
              className="flex-1"
            />
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Remove breakdown"
              onClick={() => onChange(breakdowns.filter((_, j) => j !== i))}
            >
              <TrashIcon className="size-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              Top
              <Input
                type="number"
                min={1}
                max={50}
                value={b.topN}
                onChange={(e) => {
                  const next = [...breakdowns]
                  next[i] = {
                    ...b,
                    topN: Math.min(50, Math.max(1, Number(e.target.value) || 25)),
                  }
                  onChange(next)
                }}
                className="h-7 w-14 text-xs"
              />
            </label>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={b.otherBucket}
                onChange={(e) => {
                  const next = [...breakdowns]
                  next[i] = { ...b, otherBucket: e.target.checked }
                  onChange(next)
                }}
              />
              Other bucket
            </label>
          </div>
          {/trace.?id/i.test(b.field) ? (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Breaking down by trace id has extreme cardinality.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
