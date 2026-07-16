import { useState } from "react"
import { PlusIcon, TrashIcon } from "lucide-react"

import { FieldAutocomplete } from "@/components/observe/field-autocomplete"
import { Button } from "@/components/ui/button"
import type { FilterClause, FilterOp } from "@/lib/observe/context"
import {
  emptyFilterGroup,
  type FilterGroup,
} from "@/lib/observe/trends"

const OPS: { id: FilterOp; label: string }[] = [
  { id: "eq", label: "=" },
  { id: "neq", label: "≠" },
  { id: "contains", label: "contains" },
  { id: "not_contains", label: "not contains" },
  { id: "exists", label: "exists" },
  { id: "gt", label: ">" },
  { id: "lt", label: "<" },
]

function ClauseRow({
  projectId,
  clause,
  onChange,
  onRemove,
}: {
  projectId: string
  clause: FilterClause
  onChange: (c: FilterClause) => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <FieldAutocomplete
        projectId={projectId}
        mode="fields"
        value={clause.key}
        onChange={(key) => onChange({ ...clause, key })}
        placeholder="field"
        className="w-28"
      />
      <select
        className="h-7 rounded-md border border-input bg-transparent px-1 text-xs"
        value={clause.op}
        onChange={(e) =>
          onChange({ ...clause, op: e.target.value as FilterOp })
        }
      >
        {OPS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {clause.op !== "exists" && clause.op !== "not_exists" ? (
        <FieldAutocomplete
          projectId={projectId}
          mode="values"
          field={clause.key}
          value={clause.value ?? ""}
          onChange={(value) => onChange({ ...clause, value })}
          placeholder="value"
          className="w-28"
        />
      ) : null}
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <TrashIcon className="size-3.5" />
      </button>
    </div>
  )
}

function GroupEditor({
  projectId,
  group,
  onChange,
  depth = 0,
}: {
  projectId: string
  group: FilterGroup
  onChange: (g: FilterGroup) => void
  depth?: number
}) {
  return (
    <div
      className={
        depth > 0
          ? "space-y-1.5 rounded-md border border-dashed border-border/70 p-2"
          : "space-y-1.5"
      }
    >
      <div className="flex items-center gap-2">
        <select
          className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
          value={group.mode}
          onChange={(e) =>
            onChange({
              ...group,
              mode: e.target.value as FilterGroup["mode"],
            })
          }
        >
          <option value="and">All (AND)</option>
          <option value="or">Any (OR)</option>
          <option value="not">None (NOT)</option>
        </select>
      </div>
      {group.clauses.map((c, i) => (
        <ClauseRow
          key={i}
          projectId={projectId}
          clause={c}
          onChange={(next) => {
            const clauses = [...group.clauses]
            clauses[i] = next
            onChange({ ...group, clauses })
          }}
          onRemove={() =>
            onChange({
              ...group,
              clauses: group.clauses.filter((_, j) => j !== i),
            })
          }
        />
      ))}
      {group.groups.map((g) => (
        <GroupEditor
          key={g.id}
          projectId={projectId}
          group={g}
          depth={depth + 1}
          onChange={(next) =>
            onChange({
              ...group,
              groups: group.groups.map((x) => (x.id === g.id ? next : x)),
            })
          }
        />
      ))}
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() =>
            onChange({
              ...group,
              clauses: [...group.clauses, { key: "", op: "eq", value: "" }],
            })
          }
        >
          <PlusIcon className="size-3" />
          Filter
        </Button>
        {depth < 2 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() =>
              onChange({
                ...group,
                groups: [
                  ...group.groups,
                  emptyFilterGroup(crypto.randomUUID()),
                ],
              })
            }
          >
            <PlusIcon className="size-3" />
            Group
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function TrendsFilterBuilder({
  projectId,
  filters,
  onChange,
}: {
  projectId: string
  filters: FilterGroup
  onChange: (next: FilterGroup) => void
}) {
  const [advanced, setAdvanced] = useState(
    filters.groups.length > 0 || filters.mode !== "and",
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Filters
        </h4>
        {!advanced ? (
          <button
            type="button"
            className="text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setAdvanced(true)}
          >
            Nested groups
          </button>
        ) : null}
      </div>
      <GroupEditor
        projectId={projectId}
        group={filters}
        onChange={onChange}
      />
    </div>
  )
}
