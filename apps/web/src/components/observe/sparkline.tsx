import { cn } from "@/lib/utils"

export type SparkBucket = { t: string; count: number }

export function Sparkline({
  buckets,
  className,
  height = 28,
  width = 96,
}: {
  buckets: SparkBucket[]
  className?: string
  height?: number
  width?: number
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const n = Math.max(buckets.length, 1)
  const gap = 1
  const barW = Math.max((width - gap * (n - 1)) / n, 1)

  return (
    <div
      className={cn("inline-flex items-end gap-px", className)}
      style={{ width, height }}
      data-testid="issue-sparkline"
      title={
        buckets.length
          ? `${buckets.reduce((s, b) => s + b.count, 0)} events`
          : "No trend data"
      }
    >
      {buckets.length === 0 ? (
        <div
          className="w-full rounded-sm bg-muted/40"
          style={{ height: 2 }}
        />
      ) : (
        buckets.map((b, i) => {
          const h = Math.max((b.count / max) * height, b.count > 0 ? 2 : 1)
          const recent = i >= buckets.length - 3
          return (
            <div
              key={`${b.t}-${i}`}
              className={cn(
                "rounded-[1px]",
                b.count === 0
                  ? "bg-muted/30"
                  : recent
                    ? "bg-foreground/70"
                    : "bg-foreground/35",
              )}
              style={{ width: barW, height: h }}
              title={`${b.t}: ${b.count}`}
            />
          )
        })
      )}
    </div>
  )
}
