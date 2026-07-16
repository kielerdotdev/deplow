export type ProjectSection =
  | "overview"
  | "deployments"
  | "settings"
  | "secrets"

export const PROJECT_SECTION_IDS = [
  "overview",
  "deployments",
  "settings",
  "secrets",
] as const satisfies readonly ProjectSection[]

export function isProjectSection(value: unknown): value is ProjectSection {
  return (
    typeof value === "string" &&
    (PROJECT_SECTION_IDS as readonly string[]).includes(value)
  )
}

/** Derive section from `/projects/$id[/surface]` pathname. */
export function projectSectionFromPath(pathname: string): ProjectSection | null {
  const match = pathname.match(/^\/projects\/[^/]+(?:\/([^/]+))?/)
  if (!match) return null
  const surface = match[1]
  if (!surface) return "overview"
  return isProjectSection(surface) ? surface : "overview"
}

/** @deprecated Prefer projectSectionFromPath; kept for search-param fallbacks. */
export function parseProjectSection(value: unknown): ProjectSection {
  return isProjectSection(value) ? value : "overview"
}

export function projectSectionSearch(section: ProjectSection): {
  section: ProjectSection
} {
  return { section }
}
