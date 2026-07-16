import { create } from "zustand"

import { client } from "@/lib/orpc"

export type ProjectOption = {
  id: string
  name: string
}

type ProjectStore = {
  projects: ProjectOption[]
  activeProjectId: string | null
  /** True after the first successful (or empty) list fetch. */
  loaded: boolean
  loading: boolean
  setActiveProjectId: (id: string | null) => void
  setProjects: (projects: ProjectOption[]) => void
  /** Fetch project list once; concurrent callers share the same promise. */
  ensureLoaded: () => Promise<void>
  refresh: () => Promise<void>
}

let loadPromise: Promise<void> | null = null

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  loaded: false,
  loading: false,

  setActiveProjectId: (id) => {
    if (get().activeProjectId === id) return
    set({ activeProjectId: id })
  },

  setProjects: (projects) => {
    set({ projects, loaded: true, loading: false })
  },

  ensureLoaded: () => {
    if (get().loaded) return Promise.resolve()
    if (loadPromise) return loadPromise
    set({ loading: true })
    loadPromise = client.projects
      .list()
      .then((list) => {
        set({
          projects: list.map((p) => ({ id: p.id, name: p.name })),
          loaded: true,
          loading: false,
        })
      })
      .catch(() => {
        set({ projects: [], loaded: true, loading: false })
      })
      .finally(() => {
        loadPromise = null
      })
    return loadPromise
  },

  refresh: () => {
    loadPromise = null
    set({ loaded: false })
    return get().ensureLoaded()
  },
}))

/** Sync URL project id into the store without fighting user selection races. */
export function syncActiveProjectFromPath(pathname: string) {
  const observe = pathname.match(/^\/observe\/projects\/([^/]+)/)
  if (observe?.[1]) {
    useProjectStore.getState().setActiveProjectId(observe[1])
    return
  }
  const deploy = pathname.match(/^\/projects\/([^/]+)/)
  if (deploy?.[1]) {
    useProjectStore.getState().setActiveProjectId(deploy[1])
  }
}

export function observePathForProject(
  pathname: string,
  projectId: string,
): string {
  const match = pathname.match(
    /^\/observe\/projects\/[^/]+(?:\/([^/]+(?:\/[^/]+)?))?/,
  )
  const rest = match?.[1]
  if (!rest || rest === "setup") {
    return `/observe/projects/${projectId}`
  }
  const surface = rest.split("/")[0]
  const allowed = new Set([
    "services",
    "dashboards",
    "insights",
    "explore",
    "traces",
    "logs",
    "issues",
    "releases",
    "alerts",
    "trends",
  ])
  if (allowed.has(surface)) {
    return `/observe/projects/${projectId}/${surface}`
  }
  return `/observe/projects/${projectId}`
}

export function deployPathForProject(
  pathname: string,
  projectId: string,
): string {
  const match = pathname.match(/^\/projects\/[^/]+(?:\/([^/]+))?/)
  const surface = match?.[1]
  const allowed = new Set(["deployments", "secrets", "settings"])
  if (surface && allowed.has(surface)) {
    return `/projects/${projectId}/${surface}`
  }
  return `/projects/${projectId}`
}
