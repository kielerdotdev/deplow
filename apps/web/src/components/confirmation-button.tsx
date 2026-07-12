import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { VariantProps } from "class-variance-authority"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ConfirmationButtonProps = {
  onConfirm: () => void
  children: ReactNode
  variant?: VariantProps<typeof buttonVariants>["variant"]
  holdDurationMs?: number
  disabled?: boolean
  confirmLabel?: string
  className?: string
}

export function ConfirmationButton({
  onConfirm,
  children,
  variant = "destructive",
  holdDurationMs = 1200,
  disabled,
  confirmLabel = "Hold to confirm…",
  className,
}: ConfirmationButtonProps) {
  const [progress, setProgress] = useState(0)
  const [holding, setHolding] = useState(false)
  const rafRef = useRef<number | undefined>(undefined)
  const startRef = useRef<number | undefined>(undefined)
  const confirmedRef = useRef(false)

  const cancel = useCallback(() => {
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = undefined
    }
    startRef.current = undefined
    setHolding(false)
    setProgress(0)
  }, [])

  useEffect(() => () => cancel(), [cancel])

  const tick = useCallback(
    (now: number) => {
      const start = startRef.current
      if (start === undefined) return
      const elapsed = now - start
      const pct = Math.min(100, (elapsed / holdDurationMs) * 100)
      setProgress(pct)
      if (pct >= 100) {
        confirmedRef.current = true
        setHolding(false)
        setProgress(0)
        startRef.current = undefined
        onConfirm()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    },
    [holdDurationMs, onConfirm],
  )

  const startHold = useCallback(() => {
    if (disabled || confirmedRef.current) return
    setHolding(true)
    startRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
  }, [disabled, tick])

  return (
    <Button
      type="button"
      variant={variant}
      disabled={disabled}
      className={cn("relative w-full overflow-hidden", className)}
      aria-label={
        holding ? confirmLabel : "Hold button to confirm destructive action"
      }
      aria-pressed={holding}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        startHold()
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return
        event.preventDefault()
        startHold()
      }}
      onKeyUp={(event) => {
        if (event.key !== " " && event.key !== "Enter") return
        cancel()
      }}
      onBlur={cancel}
    >
      <span
        className={cn(
          "pointer-events-none absolute inset-0 origin-left bg-current opacity-20 transition-none",
          variant === "destructive" && "bg-destructive opacity-30",
        )}
        style={{ transform: `scaleX(${progress / 100})` }}
        aria-hidden
      />
      <span className="relative z-10">
        {holding ? confirmLabel : children}
      </span>
    </Button>
  )
}
