const STORAGE_KEY = "hostrig.command.recents"
const MAX_RECENTS = 8

export type RecentCommand = {
  id: string
  label: string
  at: number
}

export function loadRecentCommands(): RecentCommand[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is RecentCommand =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as RecentCommand).id === "string" &&
          typeof (item as RecentCommand).label === "string",
      )
      .slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

export function pushRecentCommand(id: string, label: string): RecentCommand[] {
  const next: RecentCommand[] = [
    { id, label, at: Date.now() },
    ...loadRecentCommands().filter((item) => item.id !== id),
  ].slice(0, MAX_RECENTS)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota / private mode
  }
  return next
}
