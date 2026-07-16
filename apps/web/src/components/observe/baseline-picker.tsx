import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { BaselineSpec } from "@/lib/observe/context"

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
          <Button variant="outline" size="sm">
            {label}
            <ChevronDownIcon data-icon="inline-end" className="opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onChange({ mode: "none" })}>
            No baseline
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange({ mode: "previous" })}>
            Previous period
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
