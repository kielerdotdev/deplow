import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/settings/domains")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/networking" })
  },
})
