import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"

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
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
