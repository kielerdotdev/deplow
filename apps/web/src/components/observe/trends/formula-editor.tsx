import { useState } from "react"
import { PlusIcon, TrashIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  nextSeriesLetter,
  validateFormulaExpr,
  type FormulaDef,
  type SeriesDef,
} from "@/lib/observe/trends"

export function FormulaEditor({
  formulas,
  series,
  onChange,
}: {
  formulas: FormulaDef[]
  series: SeriesDef[]
  onChange: (next: FormulaDef[]) => void
}) {
  const [open, setOpen] = useState(formulas.length > 0)
  const letters = series.map((s) => s.letter)

  function add() {
    const letter = nextSeriesLetter([
      ...series,
      ...formulas.map((f) => ({ letter: f.letter }) as SeriesDef),
    ])
    onChange([
      ...formulas,
      {
        id: crypto.randomUUID(),
        letter,
        expr: letters.length >= 2 ? `${letters[1]}/${letters[0]}` : "A",
        label: undefined,
      },
    ])
    setOpen(true)
  }

  if (!open && formulas.length === 0) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => setOpen(true)}
      >
        + Formulas
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Formulas
        </h4>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={add}>
          <PlusIcon className="size-3.5" />
          Add
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Use series letters with + − * / ( ). Example: B/A*100
      </p>
      {formulas.map((f) => {
        const v = validateFormulaExpr(f.expr, letters)
        return (
          <div
            key={f.id}
            className="flex flex-col gap-1 rounded-md border border-border/70 bg-muted/20 p-2"
          >
            <div className="flex items-center gap-1.5">
              <span className="flex size-6 items-center justify-center rounded bg-muted text-xs font-bold">
                {f.letter}
              </span>
              <Input
                value={f.expr}
                onChange={(e) =>
                  onChange(
                    formulas.map((x) =>
                      x.id === f.id ? { ...x, expr: e.target.value } : x,
                    ),
                  )
                }
                className="h-7 flex-1 font-mono text-xs"
                aria-label="Formula expression"
              />
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Remove formula"
                onClick={() => onChange(formulas.filter((x) => x.id !== f.id))}
              >
                <TrashIcon className="size-3.5" />
              </button>
            </div>
            <Input
              value={f.label ?? ""}
              onChange={(e) =>
                onChange(
                  formulas.map((x) =>
                    x.id === f.id
                      ? { ...x, label: e.target.value || undefined }
                      : x,
                  ),
                )
              }
              placeholder="Label"
              className="h-7 text-xs"
            />
            {!v.ok ? (
              <p className="text-[10px] text-destructive">{v.error}</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
