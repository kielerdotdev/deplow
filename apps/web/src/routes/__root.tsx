import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"

import { NavigationProgress } from "@/components/navigation-progress"
import { NotFoundPage, RouteErrorPage } from "@/components/route-error"
import { THEME_BOOT_SCRIPT } from "@/lib/theme"

import appCss from "../styles.css?url"

export const Route = createRootRoute({
  loader: async () => {
    // Soft-bootstrap dogfood DSN for SSR HTML inject (best-effort).
    try {
      const { env } = await import("@/lib/env")
      if (!env.observeDogfood) return { dogfoodDsn: null as string | null }
      const { ensureDogfoodBootstrap } = await import("@/lib/observe/dogfood")
      const boot = await ensureDogfoodBootstrap()
      return { dogfoodDsn: boot?.dsn ?? null }
    } catch {
      return { dogfoodDsn: null as string | null }
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "deplow",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
    scripts: loaderData?.dogfoodDsn
      ? [
          {
            children: `window.__DEPLOW_DOGFOOD_DSN__=${JSON.stringify(loaderData.dogfoodDsn)};`,
          },
        ]
      : [],
  }),
  notFoundComponent: NotFoundPage,
  errorComponent: ({ error }) => (
    <RouteErrorPage error={error instanceof Error ? error : new Error(String(error))} />
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <NavigationProgress />
        {children}
        <Scripts />
      </body>
    </html>
  )
}
