import { useCallback, useRef } from "react"

import { cn } from "@/lib/utils"

export type StatusTab<T extends string = string> = {
  value: T
  label: string
  count?: number
}

type StatusTabsProps<T extends string> = {
  tabs: ReadonlyArray<StatusTab<T>>
  active: T
  onChange: (value: T) => void
  /** Result count associated with the selected tab. */
  totalCount?: number
  totalLabel?: string
  trailing?: React.ReactNode
  className?: string
  "aria-label"?: string
}

/**
 * Accessible status tablist for Observe list pages (Issues status, etc.).
 * Selected state uses background + weight, not color alone.
 */
export function StatusTabs<T extends string>({
  tabs,
  active,
  onChange,
  totalCount,
  totalLabel = "results",
  trailing,
  className,
  "aria-label": ariaLabel = "Status",
}: StatusTabsProps<T>) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const focusTab = useCallback((index: number) => {
    const el = tabRefs.current[index]
    el?.focus()
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (tabs.length === 0) return
      let next = index
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        next = (index + 1) % tabs.length
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        next = (index - 1 + tabs.length) % tabs.length
      } else if (e.key === "Home") {
        e.preventDefault()
        next = 0
      } else if (e.key === "End") {
        e.preventDefault()
        next = tabs.length - 1
      } else {
        return
      }
      const tab = tabs[next]
      if (tab) {
        onChange(tab.value)
        focusTab(next)
      }
    },
    [tabs, onChange, focusTab],
  )

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-0",
        className,
      )}
      data-testid="status-tabs"
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex min-w-0 flex-1 flex-wrap items-end gap-0.5"
      >
        {tabs.map((tab, index) => {
          const isActive = active === tab.value
          return (
            <button
              key={tab.value}
              ref={(el) => {
                tabRefs.current[index] = el
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              id={`status-tab-${tab.value}`}
              onClick={() => onChange(tab.value)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "relative inline-flex min-h-10 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span
                  className={cn(
                    "inline-flex min-w-[1.25rem] items-center justify-center rounded-md px-1.5 py-0.5 text-xs tabular-nums",
                    isActive
                      ? "bg-muted font-medium text-foreground"
                      : "bg-muted/60 text-muted-foreground",
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div className="flex shrink-0 items-center gap-2 pb-2">
        {trailing}
        {totalCount !== undefined ? (
          <span
            className="text-sm tabular-nums text-muted-foreground"
            data-testid="status-tabs-total"
            aria-live="polite"
          >
            {totalCount}{" "}
            {totalCount === 1
              ? totalLabel.replace(/s$/, "") || "result"
              : totalLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
}
