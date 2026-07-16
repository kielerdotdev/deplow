import { createFileRoute, redirect } from "@tanstack/react-router"

/** Insights library lives under Charts → Saved charts. */
export const Route = createFileRoute("/observe/projects/$projectId/insights")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/observe/projects/$projectId/trends",
      params: { projectId: params.projectId },
      search: { view: "library" },
    })
  },
})
