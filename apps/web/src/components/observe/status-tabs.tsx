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
        "flex flex-wrap items-center gap-x-3 gap-y-2",
        className,
      )}
      data-testid="status-tabs"
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="inline-flex min-w-0 flex-wrap items-center gap-0.5 rounded-lg bg-muted/50 p-0.5 ring-1 ring-inset ring-border/60"
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
                "relative inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-[color,background-color,box-shadow] duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "active:scale-[0.98]",
                isActive
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border/80"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span
                  className={cn(
                    "inline-flex min-w-[1.15rem] items-center justify-center rounded px-1 py-px text-[11px] tabular-nums",
                    isActive
                      ? "bg-muted font-semibold text-foreground"
                      : "text-muted-foreground/90",
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        {totalCount !== undefined ? (
          <span
            className="text-[13px] tabular-nums text-muted-foreground"
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
