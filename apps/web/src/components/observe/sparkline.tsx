import { cn } from "@/lib/utils"

export type SparkBucket = { t: string; count: number }

const toneBar: Record<
  "neutral" | "danger",
  { zero: string; base: string; recent: string }
> = {
  neutral: {
    zero: "bg-muted/35",
    base: "bg-foreground/30",
    recent: "bg-foreground/65",
  },
  danger: {
    zero: "bg-muted/30",
    base: "bg-destructive/35",
    recent: "bg-destructive/80",
  },
}

export function Sparkline({
  buckets,
  className,
  height = 24,
  width = 72,
  tone = "neutral",
}: {
  buckets: SparkBucket[]
  className?: string
  height?: number
  width?: number
  /** `danger` for error/issue trends */
  tone?: "neutral" | "danger"
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const n = Math.max(buckets.length, 1)
  const gap = 1.5
  const barW = Math.max((width - gap * (n - 1)) / n, 1.5)
  const colors = toneBar[tone]

  return (
    <div
      className={cn("inline-flex items-end", className)}
      style={{ width, height, gap }}
      data-testid="issue-sparkline"
      title={
        buckets.length
          ? `${buckets.reduce((s, b) => s + b.count, 0)} events`
          : "No trend data"
      }
    >
      {buckets.length === 0 ? (
        <div
          className="w-full rounded-full bg-muted/40"
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
                "rounded-[1.5px] transition-colors",
                b.count === 0
                  ? colors.zero
                  : recent
                    ? colors.recent
                    : colors.base,
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
