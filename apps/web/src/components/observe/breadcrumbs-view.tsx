import { cn } from "@/lib/utils"

export type BreadcrumbItem = {
  timestamp?: string
  type?: string
  category?: string
  message?: string
  level?: string
  data?: unknown
}

export function parseBreadcrumbs(json: string): BreadcrumbItem[] {
  if (!json) return []
  try {
    const raw = JSON.parse(json) as
      | BreadcrumbItem[]
      | { values?: BreadcrumbItem[] }
    if (Array.isArray(raw)) return raw
    return raw.values ?? []
  } catch {
    return []
  }
}

export function BreadcrumbsView({
  items,
  emptyMessage = "No breadcrumbs",
}: {
  items: BreadcrumbItem[]
  emptyMessage?: string
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }
  return (
    <ol className="flex flex-col gap-0" data-testid="breadcrumbs-view">
      {items.map((b, i) => {
        const cat = b.category || b.type || "log"
        const msg =
          b.message ||
          (b.data && typeof b.data === "object"
            ? JSON.stringify(b.data)
            : "")
        return (
          <li
            key={i}
            className="flex gap-3 border-l border-border/60 py-2 pl-3 text-xs"
          >
            <span className="w-28 shrink-0 font-mono text-[10px] text-muted-foreground">
              {formatTs(b.timestamp)}
            </span>
            <span
              className={cn(
                "w-20 shrink-0 truncate font-medium capitalize",
                b.level === "error" && "text-destructive",
                b.level === "warning" && "text-warning",
              )}
            >
              {cat}
            </span>
            <span className="min-w-0 flex-1 break-all text-foreground/90">
              {msg || "—"}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function formatTs(ts?: string): string {
  if (!ts) return "—"
  try {
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ts.slice(0, 12)
    return d.toISOString().slice(11, 23)
  } catch {
    return ts.slice(0, 12)
  }
}
