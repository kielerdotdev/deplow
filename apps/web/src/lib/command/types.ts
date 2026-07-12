import type { LucideIcon } from "lucide-react"

export type CommandMode = "goto" | "action"

export type CommandGroup =
  | "Suggestions"
  | "Navigation"
  | "Projects"
  | "Project sections"
  | "Actions"
  | "Account"

export type AppCommand = {
  id: string
  label: string
  keywords?: string[]
  group: CommandGroup
  /** Which palette surfaces this by default. `both` shows in either mode. */
  mode: CommandMode | "both"
  icon?: LucideIcon
  shortcut?: string
  disabled?: boolean
  perform: () => void | Promise<void>
}

export type CommandRegistration = Omit<AppCommand, "perform"> & {
  perform: () => void | Promise<void>
}
