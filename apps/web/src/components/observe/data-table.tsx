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
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  state = "idle",
  onRowClick,
  emptyTitle = "No rows",
  emptyDescription = "Nothing matched the current Context.",
  className,
}: {
  columns: DataTableColumn<T>[]
  rows: T[]
  state?: QueryState
  onRowClick?: (row: T) => void
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}) {
  if (state === "loading") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground",
          className,
        )}
      >
        <ObserveStatusBadge state="loading" />
        Loading…
      </div>
    )
  }
  if (state === "error") {
    return (
      <ObserveEmptyState
        className={className}
        title="Query failed"
        description="The query timed out or returned an error. Narrow the time range or filters."
      />
    )
  }
  if (rows.length === 0) {
    return (
      <ObserveEmptyState
        className={className}
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }
  const last = columns.length - 1
  return (
    <div className={cn("relative", className)}>
      {state === "sampled" || state === "partial" ? (
        <div className="mb-2 px-5">
          <ObserveStatusBadge state={state} />
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c, i) => (
              <TableHead
                key={c.id}
                className={cn(
                  "data-table-head data-table-cell",
                  i === 0 && "pl-5",
                  i === last && "pr-5",
                  c.className,
                )}
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn("data-table-row", onRowClick && "cursor-pointer")}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((c, i) => (
                <TableCell
                  key={c.id}
                  className={cn(
                    "data-table-cell whitespace-normal",
                    i === 0 && "pl-5",
                    i === last && "pr-5",
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
