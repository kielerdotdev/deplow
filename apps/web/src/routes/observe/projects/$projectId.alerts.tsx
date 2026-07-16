import { createFileRoute, redirect } from "@tanstack/react-router"

/** Alerts are created from Charts → Builder (Alert button). */
export const Route = createFileRoute("/observe/projects/$projectId/alerts")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/observe/projects/$projectId/trends",
      params: { projectId: params.projectId },
      search: { view: "builder" },
    })
  },
})
