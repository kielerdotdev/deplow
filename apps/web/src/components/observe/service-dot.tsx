import { getServiceColor } from "@/lib/observe/service-color"
import { cn } from "@/lib/utils"

/** Decorative color blob; adjacent service name remains the accessible label. */
export function ServiceDot({
  serviceName,
  className,
}: {
  serviceName: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-[35%]",
        className,
      )}
      style={{ backgroundColor: getServiceColor(serviceName) }}
    />
  )
}
