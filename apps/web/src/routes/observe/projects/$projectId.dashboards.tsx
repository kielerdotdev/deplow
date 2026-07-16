import { createFileRoute, redirect } from "@tanstack/react-router"

/** Dashboards live under Charts → Boards. */
export const Route = createFileRoute("/observe/projects/$projectId/dashboards")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/observe/projects/$projectId/trends",
      params: { projectId: params.projectId },
      search: { view: "boards" },
    })
  },
})
