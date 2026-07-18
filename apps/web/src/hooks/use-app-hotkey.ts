import { useEffect } from "react"

import {
  shouldFireShortcut,
  shortcutDef,
  type ShortcutId,
} from "@/lib/observe/shortcuts"

/**
 * Register a handler for an Observe/app shortcut from the SHORTCUTS registry.
 */
export function useAppHotkey(
  id: ShortcutId,
  handler: (event: KeyboardEvent) => void,
  options?: { enabled?: boolean },
): void {
  const enabled = options?.enabled ?? true

  useEffect(() => {
    if (!enabled) return
    const def = shortcutDef(id)
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldFireShortcut(event, def)) return
      event.preventDefault()
      handler(event)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [id, handler, enabled])
}
