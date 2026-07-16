import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouterState } from "@tanstack/react-router"

import { projectSectionFromPath } from "@/lib/command/project-section"
import type {
  AppCommand,
  CommandMode,
  CommandRegistration,
} from "@/lib/command/types"

type CommandRegistryContextValue = {
  commands: AppCommand[]
  register: (command: CommandRegistration) => void
  unregister: (id: string) => void
  open: boolean
  mode: CommandMode
  openPalette: (mode: CommandMode) => void
  setOpen: (open: boolean) => void
  projectId: string | null
  section: string | null
}

const CommandRegistryContext = createContext<CommandRegistryContextValue | null>(
  null,
)

function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/)
  return match?.[1] ?? null
}

export function CommandProvider({ children }: { children: ReactNode }) {
  const [byId, setById] = useState(() => new Map<string, AppCommand>())
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<CommandMode>("goto")

  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  })

  const projectId = projectIdFromPath(pathname)
  const section = projectSectionFromPath(pathname)

  const register = useCallback((command: CommandRegistration) => {
    setById((prev) => {
      const next = new Map(prev)
      next.set(command.id, command)
      return next
    })
  }, [])

  const unregister = useCallback((id: string) => {
    setById((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const openPalette = useCallback((nextMode: CommandMode) => {
    setMode(nextMode)
    setOpen(true)
  }, [])

  const commands = useMemo(() => Array.from(byId.values()), [byId])

  const value = useMemo(
    () => ({
      commands,
      register,
      unregister,
      open,
      mode,
      openPalette,
      setOpen,
      projectId,
      section,
    }),
    [
      commands,
      register,
      unregister,
      open,
      mode,
      openPalette,
      projectId,
      section,
    ],
  )

  return (
    <CommandRegistryContext.Provider value={value}>
      {children}
    </CommandRegistryContext.Provider>
  )
}

export function useCommandRegistry(): CommandRegistryContextValue {
  const ctx = useContext(CommandRegistryContext)
  if (!ctx) {
    throw new Error("useCommandRegistry must be used within CommandProvider")
  }
  return ctx
}

/** Soft variant for optional registration outside the shell. */
export function useCommandRegistryOptional(): CommandRegistryContextValue | null {
  return useContext(CommandRegistryContext)
}
