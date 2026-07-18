export type ShortcutId =
  | "palette.open"
  | "help.shortcuts"
  | "search.focus"
  | "time.open"
  | "filter.advanced"

export type ShortcutDef = {
  id: ShortcutId
  label: string
  group: "Global" | "Search & Time" | "Filters"
  /** Display combo, e.g. "Mod+K", "?", "/", "D", "F" */
  combo: string
  aliases?: string[]
  /** When true, fire even if focus is in an input (default false). */
  allowInInputs?: boolean
  allowWhenDialogOpen?: boolean
}

export const SHORTCUTS: Record<ShortcutId, ShortcutDef> = {
  "palette.open": {
    id: "palette.open",
    label: "Open command palette",
    group: "Global",
    combo: "Mod+K",
    aliases: ["Mod+P"],
    allowInInputs: true,
  },
  "help.shortcuts": {
    id: "help.shortcuts",
    label: "Keyboard shortcuts",
    group: "Global",
    combo: "?",
  },
  "search.focus": {
    id: "search.focus",
    label: "Focus search",
    group: "Search & Time",
    combo: "/",
  },
  "time.open": {
    id: "time.open",
    label: "Open time range",
    group: "Search & Time",
    combo: "D",
  },
  "filter.advanced": {
    id: "filter.advanced",
    label: "Advanced filter",
    group: "Filters",
    combo: "F",
  },
}

export function shortcutDef(id: ShortcutId): ShortcutDef {
  return SHORTCUTS[id]
}

export function shortcutsByGroup(): Array<{
  group: ShortcutDef["group"]
  items: ShortcutDef[]
}> {
  const order: ShortcutDef["group"][] = [
    "Global",
    "Search & Time",
    "Filters",
  ]
  const map = new Map<ShortcutDef["group"], ShortcutDef[]>()
  for (const def of Object.values(SHORTCUTS)) {
    const list = map.get(def.group) ?? []
    list.push(def)
    map.set(def.group, list)
  }
  return order
    .filter((g) => map.has(g))
    .map((group) => ({ group, items: map.get(group)! }))
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

export function isDialogOpen(): boolean {
  return Boolean(
    document.querySelector(
      '[role="dialog"][data-open], [data-slot="dialog-content"][data-open], [data-slot="sheet-content"][data-open]',
    ) ||
      document.querySelector(
        '[role="dialog"]:not([aria-hidden="true"]), [data-state="open"][role="dialog"]',
      ),
  )
}

/** Match a keyboard event against a combo string like "Mod+K" or "?". */
export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+")
  const key = parts[parts.length - 1]!
  const wantMod = parts.includes("Mod") || parts.includes("Ctrl") || parts.includes("Meta")
  const wantShift = parts.includes("Shift")
  const wantAlt = parts.includes("Alt")

  const modPressed = event.metaKey || event.ctrlKey
  if (wantMod !== modPressed) return false
  if (wantShift !== event.shiftKey && key !== "?") return false
  if (wantAlt !== event.altKey) return false

  if (key === "?") {
    return event.key === "?" || (event.shiftKey && event.key === "/")
  }

  return event.key.toLowerCase() === key.toLowerCase()
}

export function shouldFireShortcut(
  event: KeyboardEvent,
  def: ShortcutDef,
): boolean {
  if (!def.allowWhenDialogOpen && isDialogOpen()) return false
  if (!def.allowInInputs && isEditableTarget(event.target)) return false
  const combos = [def.combo, ...(def.aliases ?? [])]
  return combos.some((c) => matchesCombo(event, c))
}
