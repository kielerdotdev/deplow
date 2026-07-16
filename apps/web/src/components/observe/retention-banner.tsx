import { InfoIcon } from "lucide-react"

import { LOGS_RETENTION_DAYS } from "@/lib/observe/context"
import { cn } from "@/lib/utils"

export function RetentionBanner({
  kind = "logs",
  className,
}: {
  kind?: "logs"
  className?: string
}) {
  if (kind !== "logs") return null
  return (
    <div
      role="status"
      className={cn(
        "mb-3 flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-foreground",
        className,
      )}
      data-testid="retention-banner"
    >
      <InfoIcon className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
      <p>
        Logs retain {LOGS_RETENTION_DAYS} days. Showing the available portion of
        your selected range.
      </p>
    </div>
  )
}
