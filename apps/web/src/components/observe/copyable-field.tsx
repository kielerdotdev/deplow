import { useId, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CopyableFieldProps = {
  label: string
  value: string
  /** Accessible name for the copy control. Defaults to "Copy {label}". */
  copyLabel?: string
  className?: string
  /** Optional description below the value. */
  description?: string
}

/**
 * Labeled monospace configuration value with an attached copy control.
 * Used for DSN, OTEL endpoints, env vars, and other setup credentials.
 */
export function CopyableField({
  label,
  value,
  copyLabel,
  className,
  description,
}: CopyableFieldProps) {
  const [copied, setCopied] = useState(false)
  const fieldId = useId()
  const statusId = useId()

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard may be unavailable; keep UI quiet.
    }
  }

  return (
    <div
      className={cn("min-w-0 space-y-1.5", className)}
      data-testid="copyable-field"
    >
      <label
        htmlFor={fieldId}
        className="block text-xs font-medium text-foreground/80"
      >
        {label}
      </label>
      <div
        className={cn(
          "group flex min-h-10 items-stretch overflow-hidden rounded-lg border border-border bg-muted/30 transition-colors",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        )}
      >
        <code
          id={fieldId}
          className="min-w-0 flex-1 overflow-x-auto px-3 py-2.5 font-mono text-[12px] leading-relaxed text-foreground [overflow-wrap:anywhere] break-all sm:break-normal sm:whitespace-nowrap"
          tabIndex={0}
        >
          {value}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto shrink-0 gap-1.5 rounded-none border-l border-border px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => void copy()}
          aria-label={copyLabel ?? `Copy ${label}`}
          aria-describedby={statusId}
        >
          {copied ? (
            <CheckIcon className="size-3.5 text-success" aria-hidden />
          ) : (
            <CopyIcon className="size-3.5" aria-hidden />
          )}
          <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <span id={statusId} className="sr-only" aria-live="polite">
        {copied ? `${label} copied to clipboard` : ""}
      </span>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
