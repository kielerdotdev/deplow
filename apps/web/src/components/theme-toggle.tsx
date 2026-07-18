import { useEffect, useState } from "react"
import { MoonIcon, SunIcon } from "lucide-react"

import { SoftHit } from "@/components/soft-hit"
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  toggleTheme,
  type ThemeMode,
} from "@/lib/theme"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>("dark")

  useEffect(() => {
    const initial = resolveTheme(getStoredTheme())
    applyTheme(initial)
    setMode(initial)
  }, [])

  return (
    <SoftHit
      as="button"
      className={cn("shrink-0", className)}
      title={mode === "dark" ? "Light theme" : "Dark theme"}
      onClick={() => setMode(toggleTheme())}
    >
      <span
        className="relative flex size-8 items-center justify-center"
        aria-label={
          mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
        }
      >
        <span className="relative size-4">
          <SunIcon
            className={cn(
              "absolute inset-0 size-4 transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
              mode === "light"
                ? "scale-100 opacity-100 blur-0"
                : "scale-25 opacity-0 blur-[4px]",
            )}
          />
          <MoonIcon
            className={cn(
              "absolute inset-0 size-4 transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
              mode === "dark"
                ? "scale-100 opacity-100 blur-0"
                : "scale-25 opacity-0 blur-[4px]",
            )}
          />
        </span>
      </span>
    </SoftHit>
  )
}
