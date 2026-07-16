import { Link2Icon, SaveIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { contextToQueryString, type ObserveContext } from "@/lib/observe/context"

export function SavedViewControls({
  context,
  onSave,
}: {
  context: ObserveContext
  onSave?: (name: string) => void
}) {
  async function copyLink() {
    const qs = contextToQueryString(context)
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`
    await navigator.clipboard.writeText(
      `${window.location.origin}${url}`,
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1 px-2"
        onClick={() => void copyLink()}
        aria-label="Copy deep link"
      >
        <Link2Icon className="size-3.5" />
        Link
      </Button>
      {onSave ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1 px-2"
          onClick={() => {
            const name = window.prompt("Saved view name")
            if (name?.trim()) onSave(name.trim())
          }}
          aria-label="Save view"
        >
          <SaveIcon className="size-3.5" />
          Save
        </Button>
      ) : null}
    </div>
  )
}
