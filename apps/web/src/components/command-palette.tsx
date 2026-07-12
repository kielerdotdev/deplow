import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  BellIcon,
  ClockIcon,
  FolderIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  PlugIcon,
  SearchIcon,
  ServerIcon,
} from "lucide-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import {
  loadRecentCommands,
  PROJECT_SECTION_IDS,
  pushRecentCommand,
  useCommandRegistry,
  type AppCommand,
  type CommandGroup as CommandGroupName,
  type CommandMode,
} from "@/lib/command"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

const SECTION_LABELS: Record<(typeof PROJECT_SECTION_IDS)[number], string> = {
  overview: "Overview",
  database: "Database",
  backups: "Backups",
  deployments: "Deployments",
  logs: "Logs",
  settings: "Settings",
  secrets: "Secrets",
}

const GOTO_GROUPS: CommandGroupName[] = [
  "Suggestions",
  "Navigation",
  "Projects",
  "Project sections",
]

const ACTION_GROUPS: CommandGroupName[] = ["Actions", "Account"]

function isMacPlatform() {
  if (typeof navigator === "undefined") return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

function commandSearchValue(command: AppCommand) {
  return [command.label, command.group, ...(command.keywords ?? [])]
    .join(" ")
    .toLowerCase()
}

function matchesMode(command: AppCommand, mode: CommandMode) {
  return command.mode === "both" || command.mode === mode
}

export function CommandPalette() {
  const { commands, open, mode, setOpen, openPalette, projectId } =
    useCommandRegistry()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [recents, setRecents] = useState(() => loadRecentCommands())
  const mac = isMacPlatform()
  const mod = mac ? "⌘" : "Ctrl"

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === "p") {
        event.preventDefault()
        openPalette("goto")
      } else if (key === "k") {
        event.preventDefault()
        openPalette("action")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openPalette])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void client.projects
      .list()
      .then((list) => {
        if (!cancelled) {
          setProjects(list.map((p) => ({ id: p.id, name: p.name })))
        }
      })
      .catch(() => {
        if (!cancelled) setProjects([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const runCommand = useCallback(
    async (command: AppCommand, trackRecent: boolean) => {
      setOpen(false)
      if (trackRecent && (command.mode === "goto" || command.mode === "both")) {
        setRecents(pushRecentCommand(command.id, command.label))
      }
      await command.perform()
    },
    [setOpen],
  )

  const builtinGoto = useMemo(() => {
    const items: AppCommand[] = [
      {
        id: "nav.home",
        label: "Home",
        group: "Navigation",
        mode: "goto",
        icon: LayoutDashboardIcon,
        keywords: ["dashboard", "projects"],
        perform: () => void navigate({ to: "/" }),
      },
      {
        id: "nav.integrations",
        label: "Integrations",
        group: "Navigation",
        mode: "goto",
        icon: PlugIcon,
        keywords: ["github", "gitlab", "git"],
        perform: () => void navigate({ to: "/integrations" }),
      },
      {
        id: "nav.domains",
        label: "Domains",
        group: "Navigation",
        mode: "goto",
        icon: GlobeIcon,
        keywords: ["dns", "proxy", "caddy", "base"],
        perform: () => void navigate({ to: "/domains" }),
      },
      {
        id: "nav.notifications",
        label: "Notifications",
        group: "Navigation",
        mode: "goto",
        icon: BellIcon,
        keywords: ["webhook", "notify", "failure"],
        perform: () => void navigate({ to: "/notifications" }),
      },
      {
        id: "nav.nodes",
        label: "Nodes",
        group: "Navigation",
        mode: "goto",
        icon: ServerIcon,
        keywords: ["docker", "build"],
        perform: () => void navigate({ to: "/nodes" }),
      },
    ]

    for (const project of projects) {
      items.push({
        id: `project.${project.id}`,
        label: project.name,
        group: "Projects",
        mode: "both",
        icon: FolderIcon,
        keywords: ["project", "open", project.id],
        perform: () =>
          void navigate({
            to: "/projects/$projectId",
            params: { projectId: project.id },
            search: { section: "overview" },
          }),
      })
    }

    if (projectId) {
      for (const section of PROJECT_SECTION_IDS) {
        items.push({
          id: `section.${projectId}.${section}`,
          label: SECTION_LABELS[section],
          group: "Project sections",
          mode: "goto",
          keywords: ["section", section, projectId],
          perform: () =>
            void navigate({
              to: "/projects/$projectId",
              params: { projectId },
              search: { section },
            }),
        })
      }
    }

    return items
  }, [navigate, projects, projectId])

  const allCommands = useMemo(() => {
    const map = new Map<string, AppCommand>()
    for (const command of builtinGoto) map.set(command.id, command)
    for (const command of commands) map.set(command.id, command)
    return Array.from(map.values())
  }, [builtinGoto, commands])

  const visible = useMemo(
    () => allCommands.filter((c) => matchesMode(c, mode) && !c.disabled),
    [allCommands, mode],
  )

  const recentItems = useMemo(() => {
    if (mode !== "goto") return []
    const items: AppCommand[] = []
    for (const recent of recents) {
      const command = allCommands.find((c) => c.id === recent.id)
      if (command && matchesMode(command, "goto")) items.push(command)
    }
    return items
  }, [recents, allCommands, mode])

  const groups = mode === "goto" ? GOTO_GROUPS : ACTION_GROUPS

  const grouped = useMemo(() => {
    const result: { heading: CommandGroupName; items: AppCommand[] }[] = []
    for (const heading of groups) {
      const items =
        heading === "Suggestions"
          ? recentItems.map((c) => ({
              ...c,
              icon: c.icon ?? ClockIcon,
            }))
          : visible.filter((c) => c.group === heading)
      if (items.length) result.push({ heading, items })
    }
    const known = new Set(groups)
    const extras = new Map<CommandGroupName, AppCommand[]>()
    for (const command of visible) {
      if (known.has(command.group)) continue
      const list = extras.get(command.group) ?? []
      list.push(command)
      extras.set(command.group, list)
    }
    for (const [heading, items] of extras) {
      result.push({ heading, items })
    }
    return result
  }, [groups, recentItems, visible])

  const title = mode === "goto" ? "Go to" : "Actions"
  const description =
    mode === "goto"
      ? "Jump to a page, project, or section."
      : "Run a command or open a create flow."
  const placeholder =
    mode === "goto" ? "Go to page, project, section…" : "Type a command…"

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
    >
      <Command key={mode} className="rounded-xl! border-0 bg-transparent">
        <CommandInput placeholder={placeholder} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {grouped.map(({ heading, items }) => (
            <CommandGroup key={heading} heading={heading}>
              {items.map((command) => {
                const Icon = command.icon
                return (
                  <CommandItem
                    key={command.id}
                    value={commandSearchValue(command)}
                    disabled={command.disabled}
                    onSelect={() => {
                      void runCommand(
                        command,
                        command.mode === "goto" || command.mode === "both",
                      )
                    }}
                  >
                    {Icon ? <Icon /> : null}
                    <span className="truncate">{command.label}</span>
                    {command.shortcut ? (
                      <CommandShortcut>{command.shortcut}</CommandShortcut>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}
        </CommandList>
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            {mode === "goto" ? `${mod}P Go to` : `${mod}K Actions`}
            <span className="mx-1.5 text-border">·</span>
            Switch with {mode === "goto" ? `${mod}K` : `${mod}P`}
          </span>
          <span className="hidden sm:inline">↑↓ navigate · ↵ select · esc</span>
        </div>
      </Command>
    </CommandDialog>
  )
}

/** Header affordance that opens Go to. */
export function CommandPaletteTrigger({
  className,
}: {
  className?: string
}) {
  const { openPalette } = useCommandRegistry()
  const mac = isMacPlatform()
  const mod = mac ? "⌘" : "Ctrl"

  return (
    <button
      type="button"
      onClick={() => openPalette("goto")}
      className={cn(
        "inline-flex h-8 max-w-56 items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
      aria-label="Open go to palette"
    >
      <SearchIcon className="size-3.5 shrink-0 opacity-70" />
      <span className="hidden truncate sm:inline">Search…</span>
      <kbd className="ml-auto hidden rounded border border-border bg-background px-1 font-mono text-[10px] sm:inline">
        {mod}P
      </kbd>
    </button>
  )
}
