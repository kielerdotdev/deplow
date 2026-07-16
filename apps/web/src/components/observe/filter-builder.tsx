import { useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { FieldAutocomplete } from "./field-autocomplete"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { FilterClause, FilterOp } from "@/lib/observe/context"
import { cn } from "@/lib/utils"

const OPS: { id: FilterOp; label: string }[] = [
  { id: "eq", label: "=" },
  { id: "neq", label: "≠" },
  { id: "contains", label: "contains" },
  { id: "not_contains", label: "not contains" },
  { id: "exists", label: "exists" },
  { id: "not_exists", label: "not exists" },
  { id: "gt", label: ">" },
  { id: "gte", label: "≥" },
  { id: "lt", label: "<" },
  { id: "lte", label: "≤" },
]

const OP_LABEL: Record<FilterOp, string> = Object.fromEntries(
  OPS.map((o) => [o.id, o.label]),
) as Record<FilterOp, string>

export function filterOpLabel(op: FilterOp): string {
  return OP_LABEL[op] ?? op
}

export function FilterChip({
  filter,
  onRemove,
}: {
  filter: FilterClause
  onRemove: () => void
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-xs">
      <span className="truncate font-medium text-foreground">{filter.key}</span>
      <span className="shrink-0 text-muted-foreground">
        {filterOpLabel(filter.op)}
      </span>
      {filter.value != null && filter.value !== "" ? (
        <span className="truncate text-foreground/90">{filter.value}</span>
      ) : null}
      <button
        type="button"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Remove filter ${filter.key}`}
        onClick={onRemove}
      >
        <XIcon className="size-3" />
      </button>
    </span>
  )
}

export function FilterChips({
  filters,
  onChange,
  className,
}: {
  filters: FilterClause[]
  onChange: (next: FilterClause[]) => void
  className?: string
}) {
  if (filters.length === 0) return null
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {filters.map((f, i) => (
        <FilterChip
          key={`${f.key}-${f.op}-${f.value ?? ""}-${i}`}
          filter={f}
          onRemove={() => onChange(filters.filter((_, j) => j !== i))}
        />
      ))}
    </div>
  )
}

export function FilterBuilder({
  filters,
  onChange,
  projectId,
  signal = "spans",
  className,
}: {
  filters: FilterClause[]
  onChange: (next: FilterClause[]) => void
  projectId?: string
  signal?: "spans" | "logs"
  className?: string
}) {
  const [key, setKey] = useState("")
  const [op, setOp] = useState<FilterOp>("eq")
  const [value, setValue] = useState("")
  const needsValue = op !== "exists" && op !== "not_exists"

  function add() {
    if (!key.trim()) return
    if (needsValue && !value.trim()) return
    onChange([
      ...filters,
      {
        key: key.trim(),
        op,
        value: needsValue ? value.trim() : undefined,
      },
    ])
    setKey("")
    setValue("")
    setOp("eq")
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <FilterChips filters={filters} onChange={onChange} />
      <div className="flex flex-wrap items-center gap-1.5">
        {projectId ? (
          <FieldAutocomplete
            projectId={projectId}
            mode="fields"
            signal={signal}
            value={key}
            onChange={setKey}
            placeholder="Field"
            className="w-40"
          />
        ) : (
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Field"
            className="h-7 w-36 text-xs"
            aria-label="Filter key"
            onKeyDown={(e) => {
              if (e.key === "Enter") add()
            }}
          />
        )}
        <select
          className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
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
        {needsValue ? (
          projectId && key.trim() ? (
            <FieldAutocomplete
              projectId={projectId}
              mode="values"
              field={key.trim()}
              signal={signal}
              value={value}
              onChange={setValue}
              placeholder="Value"
              className="w-36"
            />
          ) : (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Value"
              className="h-7 w-32 text-xs"
              aria-label="Filter value"
              onKeyDown={(e) => {
                if (e.key === "Enter") add()
              }}
            />
          )
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2"
          onClick={add}
          disabled={!key.trim() || (needsValue && !value.trim())}
        >
          <PlusIcon className="size-3.5" />
          Add
        </Button>
      </div>
    </div>
  )
}
