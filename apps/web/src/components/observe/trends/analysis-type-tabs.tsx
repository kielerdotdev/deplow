import { cn } from "@/lib/utils"
import type { TrendsAnalysis } from "@/lib/observe/trends"

/** Chart builder analysis modes only — not navigation to other Observe pages. */
const TABS: { id: TrendsAnalysis; label: string }[] = [
  { id: "trends", label: "Trends" },
  { id: "compare", label: "Compare" },
  { id: "distributions", label: "Distributions" },
]

export function AnalysisTypeTabs({
  analysis,
  onAnalysisChange,
}: {
  projectId?: string
  analysis: TrendsAnalysis
  onAnalysisChange: (a: TrendsAnalysis) => void
}) {
  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-border/60 pb-2"
      aria-label="Analysis type"
    >
      {TABS.map((t) => {
        const active = analysis === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onAnalysisChange(t.id)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            aria-current={active ? "true" : undefined}
          >
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
