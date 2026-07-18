import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import {
  BellIcon,
  BugIcon,
  ChartLineIcon,
  ClockIcon,
  FolderIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  PlugIcon,
  ScrollTextIcon,
  SearchIcon,
  ServerIcon,
  ActivityIcon,
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
import { pickObserveNavSearch } from "@/lib/observe/context"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

const SECTION_LABELS: Record<(typeof PROJECT_SECTION_IDS)[number], string> = {
  overview: "Overview",
  deployments: "Deployments",
  settings: "Settings",
  secrets: "Secrets",
}

const OBSERVE_SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    icon: ActivityIcon,
    to: "/observe/projects/$projectId" as const,
  },
  {
    id: "services",
    label: "Services",
    icon: ServerIcon,
    to: "/observe/projects/$projectId/services" as const,
  },
  {
    id: "insights",
    label: "Monitor · Charts",
    icon: ChartLineIcon,
    to: "/observe/projects/$projectId/insights" as const,
  },
  {
    id: "dashboards",
    label: "Monitor · Boards",
    icon: LayoutDashboardIcon,
    to: "/observe/projects/$projectId/dashboards" as const,
  },
  {
    id: "alerts",
    label: "Monitor · Alerts",
    icon: BellIcon,
    to: "/observe/projects/$projectId/alerts" as const,
  },
  {
    id: "traces",
    label: "Traces",
    icon: ListTreeIcon,
    to: "/observe/projects/$projectId/traces" as const,
  },
  {
    id: "logs",
    label: "Logs",
    icon: ScrollTextIcon,
    to: "/observe/projects/$projectId/logs" as const,
  },
  {
    id: "issues",
    label: "Issues",
    icon: BugIcon,
    to: "/observe/projects/$projectId/issues" as const,
  },
] as const

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
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const rawSearch = useRouterState({ select: (s) => s.location.search })
  const observeSearch = useMemo(
    () =>
      pathname.startsWith("/observe")
        ? pickObserveNavSearch(
            rawSearch as unknown as Record<string, unknown>,
          )
        : {},
    [pathname, rawSearch],
  )
  const observeMode = pathname.startsWith("/observe")
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
        keywords: ["dashboard", "projects", "landing"],
        perform: () => void navigate({ to: "/" }),
      },
      {
        id: "nav.settings",
        label: "Settings",
        group: "Navigation",
        mode: "goto",
        icon: KeyRoundIcon,
        keywords: ["organization", "account", "general"],
        perform: () => void navigate({ to: "/settings" }),
      },
      {
        id: "nav.settings-api",
        label: "API & MCP access",
        group: "Navigation",
        mode: "goto",
        icon: KeyRoundIcon,
        keywords: ["mcp", "tokens", "api", "cursor"],
        perform: () => void navigate({ to: "/settings/api" }),
      },
      {
        id: "nav.integrations",
        label: "Integrations",
        group: "Navigation",
        mode: "goto",
        icon: PlugIcon,
        keywords: ["github", "gitlab", "git"],
        perform: () => void navigate({ to: "/settings/integrations" }),
      },
      {
        id: "nav.domains",
        label: "Networking & domains",
        group: "Navigation",
        mode: "goto",
        icon: GlobeIcon,
        keywords: ["dns", "proxy", "caddy", "base", "domains"],
        perform: () => void navigate({ to: "/settings/networking" }),
      },
      {
        id: "nav.notifications",
        label: "Notifications",
        group: "Navigation",
        mode: "goto",
        icon: BellIcon,
        keywords: ["webhook", "notify", "failure"],
        perform: () => void navigate({ to: "/settings/notifications" }),
      },
      {
        id: "nav.cluster",
        label: "Cluster",
        group: "Navigation",
        mode: "goto",
        icon: ServerIcon,
        keywords: ["k3s", "nodes", "workers", "hetzner"],
        perform: () => void navigate({ to: "/settings/cluster" }),
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
          }),
      })
    }

    if (projectId) {
      if (observeMode) {
        for (const section of OBSERVE_SECTIONS) {
          items.push({
            id: `observe.${projectId}.${section.id}`,
            label: section.label,
            group: "Project sections",
            mode: "goto",
            icon: section.icon,
            keywords: ["observe", "section", section.id, projectId],
            perform: () =>
              void navigate({
                to: section.to,
                params: { projectId },
                search:
                  Object.keys(observeSearch).length > 0
                    ? (observeSearch as never)
                    : undefined,
              }),
          })
        }
      } else {
        const sectionNav: Record<
          (typeof PROJECT_SECTION_IDS)[number],
          () => void
        > = {
          overview: () =>
            void navigate({
              to: "/projects/$projectId",
              params: { projectId },
            }),
          deployments: () =>
            void navigate({
              to: "/projects/$projectId/deployments",
              params: { projectId },
            }),
          secrets: () =>
            void navigate({
              to: "/projects/$projectId/secrets",
              params: { projectId },
            }),
          settings: () =>
            void navigate({
              to: "/projects/$projectId/settings",
              params: { projectId },
            }),
        }
        for (const section of PROJECT_SECTION_IDS) {
          items.push({
            id: `section.${projectId}.${section}`,
            label: SECTION_LABELS[section],
            group: "Project sections",
            mode: "goto",
            keywords: ["section", section, projectId],
            perform: sectionNav[section],
          })
        }
      }
    }

    return items
  }, [navigate, projects, projectId, observeMode, observeSearch])

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
        "inline-flex h-8 max-w-56 items-center gap-2 rounded-sm border border-border bg-transparent px-2 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      aria-label="Open go to palette"
    >
      <SearchIcon className="size-3.5 shrink-0 opacity-70" />
      <span className="hidden truncate sm:inline">
        Search projects, traces, issues…
      </span>
      <kbd className="ml-auto hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] sm:inline">
        {mod}P
      </kbd>
    </button>
  )
}
