import { createFileRoute } from "@tanstack/react-router"

import {
  exchangeGitHubOAuthCode,
  fetchGitHubUser,
  listUserInstallations,
  safeReturnTo,
} from "@/lib/core"
import {
  consumeOAuthState,
  loadGitHubAppConfig,
  platformConfig,
  upsertGitProviderLink,
  upsertGithubInstallation,
} from "@/lib/git-auth"

function redirect(base: string, path: string): Response {
  return Response.redirect(`${base}${path}`, 302)
}

function errorRedirect(base: string, error: string): Response {
  return redirect(base, `/integrations?error=${encodeURIComponent(error)}`)
}

/**
 * GitHub OAuth callback for "Connect GitHub" (git link, not login).
 */
export const Route = createFileRoute("/api/git/oauth/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get("code")
        const state = url.searchParams.get("state")
        const err = url.searchParams.get("error")
        const base = platformConfig.publicControlPlaneUrl

        if (err) return errorRedirect(base, err)
        if (!code || !state) return errorRedirect(base, "missing_code")

        const consumed = await consumeOAuthState(state)
        if (!consumed || consumed.provider !== "github") {
          return errorRedirect(base, "invalid_state")
        }

        const app = await loadGitHubAppConfig()
        if (!app) return errorRedirect(base, "app_not_configured")

        try {
          const token = await exchangeGitHubOAuthCode({ config: app, code })
          const user = await fetchGitHubUser({ accessToken: token.accessToken })
          const installations = await listUserInstallations({
            userAccessToken: token.accessToken,
          })
          const primary = installations[0]

          await upsertGitProviderLink({
            userId: consumed.userId,
            provider: "github",
            providerUserId: user.id,
            login: user.login,
            avatarUrl: user.avatarUrl,
            accessToken: token.accessToken,
            githubInstallationId: primary?.id ?? null,
            scopes: token.scope,
          })

          for (const inst of installations) {
            await upsertGithubInstallation({
              installationId: inst.id,
              accountLogin: inst.accountLogin,
              accountType: inst.accountType,
              linkedUserId: consumed.userId,
            })
          }

          // If App not installed yet, send user to install URL
          if (!primary && app.slug) {
            return Response.redirect(
              `https://github.com/apps/${app.slug}/installations/new`,
              302,
            )
          }

          const returnTo = safeReturnTo(consumed.returnTo, base)
          const sep = returnTo.includes("?") ? "&" : "?"
          return redirect(base, `${returnTo}${sep}git=connected`)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "oauth_failed"
          return errorRedirect(base, message.slice(0, 120))
        }
      },
    },
  },
})