import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/organization")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/members" })
  },
})
