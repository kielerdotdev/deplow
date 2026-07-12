import type { ProjectSection } from "@/components/project-rail"

export const PROJECT_SECTION_IDS = [
  "overview",
  "deployments",
  "logs",
  "settings",
  "secrets",
] as const satisfies readonly ProjectSection[]

export function isProjectSection(value: unknown): value is ProjectSection {
  return (
    typeof value === "string" &&
    (PROJECT_SECTION_IDS as readonly string[]).includes(value)
  )
}

/** Parse `?section=` from the URL; unknown values fall back to overview. */
export function parseProjectSection(value: unknown): ProjectSection {
  return isProjectSection(value) ? value : "overview"
}

export function projectSectionSearch(section: ProjectSection): {
  section: ProjectSection
} {
  return { section }
}
