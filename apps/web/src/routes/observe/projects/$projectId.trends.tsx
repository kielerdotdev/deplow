import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * Legacy Charts URL. Chart create/edit now lives on Saved charts
 * (`/insights`) as a dialog — keep this path for deep links and bookmarks.
 */
export const Route = createFileRoute("/observe/projects/$projectId/trends")({
  beforeLoad: ({ params, search }) => {
    const raw = search as Record<string, unknown>
    const insightId =
      typeof raw.insightId === "string" ? raw.insightId : undefined
    const tq = typeof raw.tq === "string" ? raw.tq : undefined
    const view = typeof raw.view === "string" ? raw.view : undefined

    if (view === "boards") {
      const dashboardId =
        typeof raw.dashboardId === "string" ? raw.dashboardId : undefined
      if (dashboardId) {
        throw redirect({
          to: "/observe/projects/$projectId/dashboards/$dashboardId",
          params: { projectId: params.projectId, dashboardId },
        })
      }
      throw redirect({
        to: "/observe/projects/$projectId/dashboards",
        params: { projectId: params.projectId },
      })
    }

    if (view === "library") {
      throw redirect({
        to: "/observe/projects/$projectId/insights",
        params: { projectId: params.projectId },
      })
    }

    if (insightId) {
      throw redirect({
        to: "/observe/projects/$projectId/insights",
        params: { projectId: params.projectId },
        search: { insightId },
      })
    }

    throw redirect({
      to: "/observe/projects/$projectId/insights",
      params: { projectId: params.projectId },
      search: {
        new: true,
        ...(tq ? { tq } : {}),
      },
    })
  },
})
