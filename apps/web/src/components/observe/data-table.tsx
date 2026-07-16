import { TablePending } from "@/components/route-pending"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { ObserveEmptyState } from "./empty-state"
import { ObserveStatusBadge } from "./status-badge"
import type { QueryState } from "@/lib/observe/context"

export type DataTableColumn<T> = {
  id: string
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
  /** Right-align numeric columns */
  numeric?: boolean
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  state = "idle",
  onRowClick,
  selectedId,
  emptyTitle = "No rows",
  emptyDescription = "Nothing matched the current Context.",
  emptyVariant = "no_match",
  resultCount,
  className,
}: {
  columns: DataTableColumn<T>[]
  rows: T[]
  state?: QueryState
  onRowClick?: (row: T) => void
  selectedId?: string | null
  emptyTitle?: string
  emptyDescription?: string
  emptyVariant?: "empty" | "no_match" | "outside_range" | "error"
  resultCount?: number
  className?: string
}) {
  const initialLoad = state === "loading" && rows.length === 0
  const refreshing = state === "loading" && rows.length > 0
  const count = resultCount ?? rows.length

  if (initialLoad) {
    return (
      <TablePending
        className={className}
        columns={Math.min(columns.length, 5)}
        rows={6}
      />
    )
  }
  if (state === "error" && rows.length === 0) {
    return (
      <ObserveEmptyState
        className={className}
        variant="error"
        title="Query failed"
        description="The query timed out or returned an error. Narrow the time range or filters."
      />
    )
  }
  if (rows.length === 0) {
    return (
      <ObserveEmptyState
        className={className}
        variant={emptyVariant}
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }
  const last = columns.length - 1

  function activateRow(row: T) {
    onRowClick?.(row)
  }

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          {count.toLocaleString()} result{count === 1 ? "" : "s"}
        </span>
        {state === "sampled" ||
        state === "partial" ||
        refreshing ||
        state === "error" ? (
          <ObserveStatusBadge state={refreshing ? "loading" : state} />
        ) : null}
      </div>
      <Table>
        <TableHeader className="sticky top-0 z-[1] bg-card">
          <TableRow className="hover:bg-transparent">
            {columns.map((c, i) => (
              <TableHead
                key={c.id}
                className={cn(
                  "data-table-head data-table-cell",
                  i === 0 && "pl-4",
                  i === last && "pr-4",
                  c.numeric && "text-right",
                  c.className,
                )}
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const selected = selectedId != null && row.id === selectedId
            return (
              <TableRow
                key={row.id}
                data-selected={selected || undefined}
                className={cn(
                  "data-table-row focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  onRowClick && "cursor-pointer",
                  refreshing && "opacity-60 transition-opacity",
                  selected && "bg-muted/60 hover:bg-muted/70",
                )}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                onClick={() => activateRow(row)}
                onKeyDown={(e) => {
                  if (!onRowClick) return
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    activateRow(row)
                  }
                }}
              >
                {columns.map((c, i) => (
                  <TableCell
                    key={c.id}
                    className={cn(
                      "data-table-cell whitespace-normal",
                      i === 0 && "pl-4",
                      i === last && "pr-4",
                      c.numeric && "text-right tabular-nums",
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
