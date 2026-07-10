import { createFileRoute } from "@tanstack/react-router"

import { completeGitHubAppManifest } from "@/lib/core"
import { platformConfig, saveGitHubAppConfig } from "@/lib/git-auth"

function redirect(base: string, path: string): Response {
  return Response.redirect(`${base}${path}`, 302)
}

function errorRedirect(base: string, error: string): Response {
  return redirect(base, `/integrations?error=${encodeURIComponent(error)}`)
}

/**
 * GitHub App manifest conversion callback.
 * GitHub redirects here with ?code= after the operator creates the App.
 */
export const Route = createFileRoute("/api/git/github/app-manifest/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get("code")
        const base = platformConfig.publicControlPlaneUrl

        if (!code) return errorRedirect(base, "missing_manifest_code")

        try {
          const app = await completeGitHubAppManifest({ code })
          await saveGitHubAppConfig({
            appId: app.appId,
            clientId: app.clientId,
            clientSecret: app.clientSecret,
            privateKey: app.privateKey,
            webhookSecret: app.webhookSecret,
            slug: app.slug,
          })
          return redirect(base, "/integrations?github_app=created")
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "manifest_failed"
          return errorRedirect(base, message.slice(0, 160))
        }
      },
    },
  },
})