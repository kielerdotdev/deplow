import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { useRegisterCommand } from "@/lib/command"
import type { CommandGroup, CommandMode } from "@/lib/command"

type CommandActionProps = {
  id: string
  label: string
  group?: CommandGroup
  mode?: CommandMode | "both"
  keywords?: string[]
  icon?: LucideIcon
  shortcut?: string
  disabled?: boolean
  onSelect: () => void | Promise<void>
  /** When omitted, registers headlessly (no visible trigger). */
  children?: ReactNode
}

/**
 * Registers a palette action for the lifetime of this tree.
 * Children (if any) render unchanged — use to wrap existing CTAs.
 */
export function CommandAction({
  id,
  label,
  group = "Actions",
  mode = "action",
  keywords,
  icon,
  shortcut,
  disabled,
  onSelect,
  children,
}: CommandActionProps) {
  useRegisterCommand({
    id,
    label,
    group,
    mode,
    keywords,
    icon,
    shortcut,
    disabled,
    perform: onSelect,
  })

  return children ?? null
}
