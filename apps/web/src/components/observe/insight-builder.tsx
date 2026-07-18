import { ChartBuilder } from "@/components/observe/trends/chart-builder"
import type { ObserveContext } from "@/lib/observe/context"
import type { TrendsQuery } from "@/lib/observe/trends"
import { Button } from "@/components/ui/button"

/**
 * @deprecated Prefer ChartBuilderDialog from Saved charts.
 * Kept for any remaining call sites that embed the builder inline.
 */
export function InsightBuilder({
  projectId,
  initial,
  onCancel,
  onSaved,
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
    <div className="flex flex-col gap-3">
      <ChartBuilder
        projectId={projectId}
        initialQuery={initial?.spec}
        insightMeta={
          initial
            ? {
                id: initial.id,
                name: initial.name,
                description: initial.description,
              }
            : null
        }
        onSaved={() => {
          void onSaved()
        }}
      />
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Close
        </Button>
      </div>
    </div>
  )
}
