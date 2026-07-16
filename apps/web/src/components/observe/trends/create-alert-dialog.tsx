import { CreateAlertDialog } from "@/components/observe/create-alert-dialog"
import type { TrendsQuery } from "@/lib/observe/trends"

/** Charts builder → create alert with the current query attached. */
export function CreateAlertFromTrends({
  projectId,
  query,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string
  query: TrendsQuery
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const primary = query.series[0]
  return (
    <CreateAlertDialog
      projectId={projectId}
      open={open}
      onOpenChange={onOpenChange}
      onCreated={onCreated}
      defaults={{
        name: primary?.label ? `Alert · ${primary.label}` : "Chart alert",
        metric: primary?.measure ?? "error_rate",
        threshold: (primary?.measure ?? "error_rate") === "error_rate"
          ? "0.05"
          : "100",
        contextJson: JSON.stringify({ trendsQuery: query }),
      }}
    />
  )
}
