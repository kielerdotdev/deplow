import { useId, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type CodeLanguage = {
  id: string
  label: string
  code: string
}

type CodeSnippetProps = {
  /** Single language snippet. Prefer `languages` for multi-language tabs. */
  code?: string
  language?: string
  languages?: CodeLanguage[]
  className?: string
  /** Max visual height before vertical scroll. Omit for auto height. */
  maxHeight?: string
}

/**
 * Readable code block with language label and copy action.
 * Avoids nested scroll traps for short snippets.
 */
export function CodeSnippet({
  code,
  language = "code",
  languages,
  className,
  maxHeight,
}: CodeSnippetProps) {
  const tabs = languages?.length
    ? languages
    : [{ id: language, label: language, code: code ?? "" }]
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "code")
  const [copied, setCopied] = useState(false)
  const statusId = useId()
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const activeCode = active?.code ?? ""
  const multi = tabs.length > 1

  async function copy() {
    try {
      await navigator.clipboard.writeText(activeCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // ignore
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-muted/25",
        className,
      )}
      data-testid="code-snippet"
    >
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-border/80 bg-muted/40 px-2.5">
        {multi ? (
          <div
            role="tablist"
            aria-label="Code language"
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
          >
            {tabs.map((tab) => {
              const selected = tab.id === activeId
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center rounded-md px-2 text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => {
                    setActiveId(tab.id)
                    setCopied(false)
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        ) : (
          <span className="truncate px-1 text-xs font-medium text-muted-foreground">
            {active?.label ?? language}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => void copy()}
          aria-label="Copy code"
          aria-describedby={statusId}
        >
          {copied ? (
            <CheckIcon className="size-3.5 text-success" aria-hidden />
          ) : (
            <CopyIcon className="size-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre
        className={cn(
          "overflow-x-auto p-3.5 font-mono text-[12px] leading-relaxed text-foreground",
          maxHeight && "overflow-y-auto",
        )}
        style={maxHeight ? { maxHeight } : undefined}
        tabIndex={0}
      >
        <code>{activeCode}</code>
      </pre>
      <span id={statusId} className="sr-only" aria-live="polite">
        {copied ? "Code copied to clipboard" : ""}
      </span>
    </div>
  )
}
