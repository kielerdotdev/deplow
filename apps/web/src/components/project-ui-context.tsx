import { createContext, useContext } from "react"

type ProjectUiContextValue = {
  openAddService: () => void
  setError: (message: string | null) => void
}

export const ProjectUiContext = createContext<ProjectUiContextValue | null>(
  null,
)

export function useProjectUi() {
  const ctx = useContext(ProjectUiContext)
  if (!ctx) throw new Error("useProjectUi must be used under ProjectLayout")
  return ctx
}
