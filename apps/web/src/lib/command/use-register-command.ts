import { useEffect, useRef } from "react"

import { useCommandRegistryOptional } from "@/lib/command/context"
import type { CommandRegistration } from "@/lib/command/types"

/**
 * Register one or more commands for the lifetime of the calling component.
 * `perform` always uses the latest callback via ref.
 */
export function useRegisterCommand(
  commands: CommandRegistration | CommandRegistration[] | null | undefined,
) {
  const registry = useCommandRegistryOptional()
  const list = !commands ? [] : Array.isArray(commands) ? commands : [commands]
  const performRefs = useRef(new Map<string, CommandRegistration["perform"]>())

  for (const command of list) {
    performRefs.current.set(command.id, command.perform)
  }

  const signature = list
    .map(
      (c) =>
        [
          c.id,
          c.label,
          c.group,
          c.mode,
          c.disabled ? "1" : "0",
          c.shortcut ?? "",
          (c.keywords ?? []).join(","),
          c.icon?.displayName ?? c.icon?.name ?? "",
        ].join("|"),
    )
    .join(";")

  useEffect(() => {
    if (!registry || list.length === 0) return

    for (const command of list) {
      registry.register({
        ...command,
        perform: () => {
          const fn = performRefs.current.get(command.id)
          return fn?.()
        },
      })
    }

    const ids = list.map((c) => c.id)
    return () => {
      for (const id of ids) registry.unregister(id)
    }
    // signature captures field changes; registry methods are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, signature])
}
