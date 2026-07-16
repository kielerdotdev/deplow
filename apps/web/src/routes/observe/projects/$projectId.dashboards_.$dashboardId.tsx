import { createFileRoute, redirect } from "@tanstack/react-router"

/** Dashboard detail → Charts → Boards with dashboardId. */
export const Route = createFileRoute(
  "/observe/projects/$projectId/dashboards_/$dashboardId",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/observe/projects/$projectId/trends",
      params: { projectId: params.projectId },
      search: { view: "boards", dashboardId: params.dashboardId },
    })
  },
})
