import { useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { FilterClause, FilterOp } from "@/lib/observe/context"

const OPS: { id: FilterOp; label: string }[] = [
  { id: "eq", label: "=" },
  { id: "neq", label: "≠" },
  { id: "contains", label: "contains" },
  { id: "exists", label: "exists" },
]

export function FilterBuilder({
  filters,
  onChange,
}: {
  filters: FilterClause[]
  onChange: (next: FilterClause[]) => void
}) {
  const [key, setKey] = useState("")
  const [op, setOp] = useState<FilterOp>("eq")
  const [value, setValue] = useState("")

  function add() {
    if (!key.trim()) return
    onChange([
      ...filters,
      {
        key: key.trim(),
        op,
        value: op === "exists" || op === "not_exists" ? undefined : value,
      },
    ])
    setKey("")
    setValue("")
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((f, i) => (
        <span
          key={`${f.key}-${i}`}
          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-xs"
        >
          <span className="font-medium">{f.key}</span>
          <span className="text-muted-foreground">{f.op}</span>
          {f.value ? <span>{f.value}</span> : null}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Remove filter ${f.key}`}
            onClick={() => onChange(filters.filter((_, j) => j !== i))}
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <Input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="attr.key"
        className="h-7 w-28 text-xs"
        aria-label="Filter key"
        onKeyDown={(e) => {
          if (e.key === "Enter") add()
        }}
      />
      <select
        className="h-7 rounded-md border border-input bg-transparent px-1 text-xs"
        value={op}
        onChange={(e) => setOp(e.target.value as FilterOp)}
        aria-label="Filter operator"
      >
        {OPS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {op !== "exists" && op !== "not_exists" ? (
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value"
          className="h-7 w-24 text-xs"
          aria-label="Filter value"
          onKeyDown={(e) => {
            if (e.key === "Enter") add()
          }}
        />
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        onClick={add}
        aria-label="Add filter"
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </div>
  )
}
