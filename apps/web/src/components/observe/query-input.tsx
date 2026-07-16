import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function QueryInput({
  value,
  onChange,
  placeholder = "Search services, operations, messages…",
  className,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("h-8 min-w-[12rem] flex-1 text-sm", className)}
      aria-label="Query"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
