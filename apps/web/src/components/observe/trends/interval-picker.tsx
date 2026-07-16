import type { TrendsInterval } from "@/lib/observe/trends"

const INTERVALS: { id: TrendsInterval; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "10s", label: "10s" },
  { id: "1m", label: "1m" },
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "1h", label: "1h" },
  { id: "6h", label: "6h" },
  { id: "1d", label: "1d" },
  { id: "1w", label: "1w" },
]

export function IntervalPicker({
  value,
  onChange,
}: {
  value: TrendsInterval
  onChange: (next: TrendsInterval) => void
}) {
  return (
    <select
      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value as TrendsInterval)}
      aria-label="Interval"
    >
      {INTERVALS.map((i) => (
        <option key={i.id} value={i.id}>
          {i.label}
        </option>
      ))}
    </select>
  )
}
