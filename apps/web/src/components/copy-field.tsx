import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CopyFieldProps = {
  value: string
  className?: string
}

export function CopyField({ value, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
        <code className="block min-w-0 break-all font-mono text-xs text-foreground [overflow-wrap:anywhere]">
          {value}
        </code>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full sm:w-auto sm:self-end"
        onClick={() => void copy()}
      >
        {copied ? (
          <CheckIcon data-icon="inline-start" />
        ) : (
          <CopyIcon data-icon="inline-start" />
        )}
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  )
}
