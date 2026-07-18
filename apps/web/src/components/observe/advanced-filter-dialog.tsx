import { useEffect, useState } from "react"
import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { Textarea } from "@/components/ui/textarea"
import { parseWhereClause } from "@/lib/observe/where-clause"
import { cn } from "@/lib/utils"

export function AdvancedFilterDialog({
  initialValue,
  onApply,
  className,
}: {
  initialValue: string
  onApply: (value: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(initialValue)
  const { warnings } = parseWhereClause(value)

  useEffect(() => {
    if (open) setValue(initialValue)
  }, [open, initialValue])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onApply(value)
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, value, onApply])

  const hasActive = initialValue.trim().length > 0

  return (
    <>
      <Button
        type="button"
        variant={hasActive ? "secondary" : "outline"}
        size="sm"
        className={cn("gap-2", className)}
        data-shortcut-open="advanced-filter"
        data-testid="advanced-filter-trigger"
        onClick={() => setOpen(true)}
      >
        <SearchIcon
          className={
            hasActive
              ? "size-3.5 text-primary"
              : "size-3.5 text-muted-foreground"
          }
        />
        <span>Advanced</span>
        <Kbd>F</Kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Advanced filter</DialogTitle>
            <DialogDescription>
              Write AND-only clauses, e.g.{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                service = &quot;checkout&quot; AND attr.http.route !=
                &quot;/health&quot;
              </code>
              . Press <Kbd>⌘</Kbd>
              <Kbd>Enter</Kbd> to apply.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              rows={8}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='service = "checkout" AND body contains "timeout"'
              className="font-mono text-sm"
              spellCheck={false}
            />
            {warnings.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-destructive">
                {warnings.map((w, i) => (
                  <li key={`${w.clause}-${i}`}>
                    {w.message}: <span className="font-mono">{w.clause}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setValue("")
                onApply("")
                setOpen(false)
              }}
            >
              Clear
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onApply(value)
                  setOpen(false)
                }}
              >
                Apply
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
