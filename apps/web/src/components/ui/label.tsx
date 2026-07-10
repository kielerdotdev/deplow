import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Accessible form label (shadcn / base-nova style).
 * Standalone — does not require Field.Root (use FieldLabel inside Field for that).
 */
const Label = React.forwardRef<
  HTMLLabelElement,
  React.ComponentPropsWithoutRef<"label">
>(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
})

export { Label }
