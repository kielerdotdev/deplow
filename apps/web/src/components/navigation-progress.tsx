import { useEffect, useRef, useState } from "react"
import { useRouterState } from "@tanstack/react-router"

import { cn } from "@/lib/utils"

/**
 * Thin top progress bar for route transitions. Lives in the root document so it
 * survives AppShell remounts between pages.
 */
export function NavigationProgress() {
  const isPending = useRouterState({
    select: (s) => s.status === "pending",
  })
  const [visible, setVisible] = useState(false)
  const [completing, setCompleting] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isPending) {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current)
        hideTimer.current = null
      }
      setCompleting(false)
      setVisible(true)
      return
    }
    if (!visible) return
    setCompleting(true)
    hideTimer.current = setTimeout(() => {
      setVisible(false)
      setCompleting(false)
      hideTimer.current = null
    }, 280)
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [isPending, visible])

  if (!visible) return null

  return (
    <div
      role="progressbar"
      aria-busy={isPending}
      aria-valuetext={isPending ? "Loading" : "Loaded"}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
      data-testid="navigation-progress"
    >
      <div
        className={cn(
          "h-full origin-left bg-foreground transition-transform ease-out",
          completing
            ? "w-full duration-200"
            : "w-1/3 animate-nav-progress duration-0",
        )}
      />
    </div>
  )
}
