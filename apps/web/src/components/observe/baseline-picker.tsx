import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { BaselineSpec } from "@/lib/observe/context"
import { ChevronDownIcon } from "lucide-react"

export function BaselinePicker({
  value,
  onChange,
}: {
  value: BaselineSpec
  onChange: (next: BaselineSpec) => void
}) {
  const label =
    value.mode === "none"
      ? "No baseline"
      : value.mode === "previous"
        ? "Previous period"
        : "Custom baseline"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1">
            {label}
            <ChevronDownIcon className="size-3.5 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onChange({ mode: "none" })}>
          No baseline
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange({ mode: "previous" })}>
          Previous period
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
