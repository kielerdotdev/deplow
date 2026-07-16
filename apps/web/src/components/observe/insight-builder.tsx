import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import type { ObserveContext } from "@/lib/observe/context"
import type { TrendsQuery } from "@/lib/observe/trends"

/** @deprecated Use the Trends page editor instead. */
export function InsightBuilder({
  projectId,
  initial,
  onCancel,
}: {
  projectId: string
  context: ObserveContext
  initial: {
    id: string
    name: string
    description: string | null
    spec: TrendsQuery
  } | null
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  return (
    <div className="surface-panel space-y-3 p-6">
      <h2 className="text-sm font-semibold">Insights editor moved to Trends</h2>
      <p className="text-sm text-muted-foreground">
        Charts are now built with the Trends query builder (multi-series,
        formulas, nested filters).
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          render={
            <Link
              to="/observe/projects/$projectId/trends"
              params={{ projectId }}
              search={
                initial
                  ? { view: "builder", insightId: initial.id }
                  : { view: "builder" }
              }
            />
          }
        >
          Open Trends
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
