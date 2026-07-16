import type { Selection } from "@/lib/observe/context"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

/** Displays active rectangular selection and clear action. */
export function SelectionBrush({
  selection,
  selectedCount,
  baselineCount,
  onClear,
}: {
  selection: Selection | null | undefined
  selectedCount?: number
  baselineCount?: number
  onClear?: () => void
}) {
  if (!selection) return null
  return (
    <div className="surface-inset flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
      <span className="font-semibold tracking-tight">Selection</span>
      <span className="text-muted-foreground">
        {new Date(selection.timeFrom).toLocaleString()} →{" "}
        {new Date(selection.timeTo).toLocaleString()}
      </span>
      <span className="text-muted-foreground">
        {selection.yAxis === "duration_ms" ? "duration" : "error"}{" "}
        {selection.yMin}–{selection.yMax}
        {selection.yAxis === "duration_ms" ? "ms" : ""}
      </span>
      {selectedCount !== undefined ? (
        <span className="tabular-nums">
          {selectedCount.toLocaleString()} spans
          {baselineCount !== undefined
            ? ` vs ${baselineCount.toLocaleString()} baseline`
            : null}
        </span>
      ) : null}
      {onClear ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-1"
          onClick={onClear}
          aria-label="Clear selection"
        >
          <XIcon className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}
