import { cn } from "@/lib/utils"

export type ChartAnnotation = {
  id: string
  at: number
  label: string
  kind?: "release" | "deploy" | "alert"
}

/** Vertical markers over a time series (releases / deploys). */
export function AnnotationLayer({
  annotations,
  range,
  className,
}: {
  annotations: ChartAnnotation[]
  range: { from: number; to: number }
  className?: string
}) {
  const span = Math.max(range.to - range.from, 1)
  return (
    <div
      className={cn("pointer-events-none absolute inset-0", className)}
      aria-hidden
    >
      {annotations.map((a) => {
        const left = ((a.at - range.from) / span) * 100
        if (left < 0 || left > 100) return null
        return (
          <div
            key={a.id}
            className="absolute top-0 bottom-0 w-px bg-info/60"
            style={{ left: `${left}%` }}
            title={a.label}
          >
            <span className="absolute top-0 left-1 truncate text-[9px] text-info">
              {a.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
