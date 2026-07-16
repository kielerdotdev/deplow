import { createFileRoute, redirect } from "@tanstack/react-router"

import { getSession } from "@/lib/auth.functions"

/** Setup is embedded onboarding — keep the URL for old bookmarks. */
export const Route = createFileRoute("/observe/projects/$projectId/setup")({
  beforeLoad: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    throw redirect({
      to: "/observe/projects/$projectId",
      params: { projectId: params.projectId },
    })
  },
})
