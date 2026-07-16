import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/settings/team")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/members" })
  },
})
