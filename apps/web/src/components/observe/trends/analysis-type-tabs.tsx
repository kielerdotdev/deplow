import { Link } from "@tanstack/react-router"

import { cn } from "@/lib/utils"
import type { TrendsAnalysis } from "@/lib/observe/trends"

const TABS: {
  id: TrendsAnalysis | "explore" | "traces" | "logs" | "errors"
  label: string
  kind: "analysis" | "link"
}[] = [
  { id: "trends", label: "Trends", kind: "analysis" },
  { id: "compare", label: "Compare", kind: "analysis" },
  { id: "distributions", label: "Distributions", kind: "analysis" },
  { id: "explore", label: "Explore", kind: "link" },
  { id: "traces", label: "Traces", kind: "link" },
  { id: "logs", label: "Logs", kind: "link" },
  { id: "errors", label: "Errors", kind: "link" },
]

export function AnalysisTypeTabs({
  projectId,
  analysis,
  onAnalysisChange,
}: {
  projectId: string
  analysis: TrendsAnalysis
  onAnalysisChange: (a: TrendsAnalysis) => void
}) {
  const base = `/observe/projects/${projectId}`
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border/60 pb-2">
      {TABS.map((t) => {
        if (t.kind === "link") {
          const to =
            t.id === "errors"
              ? `${base}/issues`
              : `${base}/${t.id}`
          return (
            <Link
              key={t.id}
              to={to}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              {t.label}
            </Link>
          )
        }
        const active = analysis === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onAnalysisChange(t.id as TrendsAnalysis)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
