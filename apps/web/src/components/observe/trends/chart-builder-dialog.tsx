import { ChartLineIcon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import {
  ChartBuilder,
  type ChartInsightMeta,
} from "@/components/observe/trends/chart-builder"
import { Button } from "@/components/ui/button"
import type { TrendsQuery } from "@/lib/observe/trends"

type ChartBuilderDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** When set, dialog edits this saved chart. */
  insight?: ChartInsightMeta | null
  initialQuery?: TrendsQuery
  alertCount?: number
  onSaved?: (insight: ChartInsightMeta) => void
}

/**
 * Create / edit a saved chart. Replaces the standalone Charts page.
 */
export function ChartBuilderDialog({
  open,
  onOpenChange,
  projectId,
  insight = null,
  initialQuery,
  alertCount,
  onSaved,
}: ChartBuilderDialogProps) {
  const editing = Boolean(insight?.id)

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit chart" : "Create chart"}
      description={
        editing
          ? "Tune the query, then save for boards and alerts."
          : "Build a Trends query and save it for boards and reuse."
      }
      icon={ChartLineIcon}
      size="xl"
      contentClassName="sm:max-w-[min(72rem,calc(100vw-2rem))]"
      bodyClassName="px-4 py-3 sm:px-5"
      footer={
        <div className="flex w-full justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </div>
      }
    >
      {/* Remount when switching create ↔ edit so state resets cleanly. */}
      {open ? (
        <ChartBuilder
          key={insight?.id ?? "new"}
          projectId={projectId}
          initialQuery={initialQuery}
          insightMeta={insight}
          alertCount={alertCount}
          onSaved={onSaved}
          onSaveAndClose={(saved) => {
            onSaved?.(saved)
            onOpenChange(false)
          }}
        />
      ) : null}
    </ActionDialog>
  )
}
