import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export type StatStripItem = {
  label: string
  value: React.ReactNode
  unit?: string
  onClick?: () => void
  warn?: boolean
}

/** One panel, several KPIs — avoids a card-per-number look. */
export function StatStrip({
  items,
  loading = false,
  className,
}: {
  items: StatStripItem[]
  loading?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "surface-panel grid sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {items.map((item, i) => {
        const interactive = Boolean(item.onClick)
        const cellClass = cn(
          "min-w-0 px-4 py-3.5 text-left",
          i > 0 && "border-t border-border",
          "sm:border-t-0",
          i >= 2 && "sm:border-t sm:border-border",
          i % 2 === 1 && "sm:border-l sm:border-border",
          "lg:border-t-0",
          i > 0 && "lg:border-l lg:border-border",
          interactive &&
            "transition-[background-color,box-shadow] duration-150 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:scale-[0.99]",
        )

        const body = (
          <>
            <p className="label-micro">{item.label}</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-20" />
            ) : (
              <p
                className={cn(
                  "stat-metric mt-2 text-[1.75rem] font-semibold leading-none tracking-tight",
                  item.warn ? "text-destructive" : "text-foreground",
                )}
              >
                {item.value}
                {item.unit ? (
                  <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">
                    {item.unit}
                  </span>
                ) : null}
              </p>
            )}
          </>
        )

        if (interactive) {
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={cellClass}
            >
              {body}
            </button>
          )
        }

        return (
          <div key={item.label} className={cellClass}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
