import { Outlet, createFileRoute } from "@tanstack/react-router"

/**
 * Layout for /observe/projects/$projectId/* — must render Outlet so
 * child routes (traces, logs, issues, …) are not swallowed by Overview.
 */
export const Route = createFileRoute("/observe/projects/$projectId")({
  component: ObserveProjectLayout,
})

function ObserveProjectLayout() {
  return <Outlet />
}
