import { createFileRoute } from "@tanstack/react-router"

import {
  exchangeGitLabOAuthCode,
  fetchGitLabUser,
  safeReturnTo,
} from "@/lib/core"
import {
  consumeOAuthState,
  loadGitLabOAuthConfig,
  platformConfig,
  upsertGitProviderLink,
} from "@/lib/git-auth"

function redirect(base: string, path: string): Response {
  return Response.redirect(`${base}${path}`, 302)
}

function errorRedirect(base: string, error: string): Response {
  return redirect(base, `/integrations?error=${encodeURIComponent(error)}`)
}

export const Route = createFileRoute("/api/git/oauth/gitlab/callback")({
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
        if (!consumed || consumed.provider !== "gitlab") {
          return errorRedirect(base, "invalid_state")
        }

        const gl = await loadGitLabOAuthConfig()
        if (!gl) return errorRedirect(base, "gitlab_not_configured")

        try {
          const redirectUri = `${base}/api/git/oauth/gitlab/callback`
          const token = await exchangeGitLabOAuthCode({
            config: gl,
            code,
            redirectUri,
          })
          const user = await fetchGitLabUser({
            config: gl,
            accessToken: token.accessToken,
          })

          await upsertGitProviderLink({
            userId: consumed.userId,
            provider: "gitlab",
            providerUserId: user.id,
            login: user.login,
            avatarUrl: user.avatarUrl,
            accessToken: token.accessToken,
            refreshToken: token.refreshToken,
            expiresAt: token.expiresIn
              ? new Date(Date.now() + token.expiresIn * 1000)
              : null,
          })

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