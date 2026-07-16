import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { TimePreset, TimeRange } from "@/lib/observe/context"

const PRESETS: { id: TimePreset; label: string }[] = [
  { id: "15m", label: "Last 15m" },
  { id: "1h", label: "Last 1h" },
  { id: "6h", label: "Last 6h" },
  { id: "24h", label: "Last 24h" },
  { id: "7d", label: "Last 7d" },
  { id: "14d", label: "Last 14d" },
  { id: "30d", label: "Last 30d" },
]

export function TimeRangePicker({
  value,
  onChange,
}: {
  value: TimeRange
  onChange: (next: TimeRange) => void
}) {
  const label =
    value.kind === "preset"
      ? (PRESETS.find((p) => p.id === value.preset)?.label ?? value.preset)
      : "Custom range"

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
          {PRESETS.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => onChange({ kind: "preset", preset: p.id })}
            >
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
