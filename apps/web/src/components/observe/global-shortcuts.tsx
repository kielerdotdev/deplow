import { useCallback, useState } from "react"

import { KeyboardShortcutsDialog } from "@/components/observe/keyboard-shortcuts-dialog"
import { useAppHotkey } from "@/hooks/use-app-hotkey"

/**
 * Observe keyboard UX: `/` focus search, `D` time picker, `F` advanced filter,
 * `?` shortcuts help. Mount once under Observe project layout (or AppShell).
 */
export function GlobalObserveShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false)

  useAppHotkey("help.shortcuts", () => setHelpOpen(true))

  useAppHotkey("search.focus", () => {
    const target = document.querySelector<HTMLElement>(
      '[data-shortcut-focus="search"]',
    )
    if (!target) return
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      target.focus()
      target.select()
    } else {
      target.click()
    }
  })

  useAppHotkey("time.open", () => {
    const target = document.querySelector<HTMLElement>(
      '[data-shortcut-open="time"]',
    )
    target?.click()
  })

  useAppHotkey("filter.advanced", () => {
    const target = document.querySelector<HTMLElement>(
      '[data-shortcut-open="advanced-filter"]',
    )
    target?.click()
  })

  const onOpenChange = useCallback((open: boolean) => {
    setHelpOpen(open)
  }, [])

  return (
    <KeyboardShortcutsDialog open={helpOpen} onOpenChange={onOpenChange} />
  )
}
