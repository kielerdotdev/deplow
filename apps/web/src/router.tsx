import { createRouter as createTanStackRouter } from "@tanstack/react-router"

import { RouteErrorPage } from "@/components/route-error"
import { RoutePending } from "@/components/route-pending"

import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    /** Show pending UI after a short wait so fast navigations stay snappy. */
    defaultPendingMs: 200,
    /** Avoid a one-frame flash of the pending skeleton. */
    defaultPendingMinMs: 200,
    /** Content-only; top-level AppShell routes set ShellPending explicitly. */
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: ({ error }) => (
      <RouteErrorPage
        error={error instanceof Error ? error : new Error(String(error))}
      />
    ),
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
