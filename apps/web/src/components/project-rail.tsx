import type { LucideIcon } from "lucide-react"
import {
  KeyRoundIcon,
  LayoutGridIcon,
  RocketIcon,
  Settings2Icon,
} from "lucide-react"

import type { ProjectSection } from "@/lib/command/project-section"

export type { ProjectSection }

export const PROJECT_SECTION_ITEMS: {
  id: ProjectSection
  label: string
  icon: LucideIcon
}[] = [
  { id: "overview", label: "Overview", icon: LayoutGridIcon },
  { id: "deployments", label: "Deployments", icon: RocketIcon },
  { id: "settings", label: "Settings", icon: Settings2Icon },
  { id: "secrets", label: "Secrets", icon: KeyRoundIcon },
]

/** Path for a project section (sidebar / command palette). */
export function projectSectionPath(
  projectId: string,
  section: ProjectSection,
): string {
  if (section === "overview") return `/projects/${projectId}`
  return `/projects/${projectId}/${section}`
}
