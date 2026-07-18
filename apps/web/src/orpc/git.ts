import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { startGitOAuthInputSchema } from "@deplow/shared"

import {
  buildGitHubAppManifest,
  GITHUB_OAUTH_CALLBACK_PATH,
  getAuthenticatedGitHubApp,
  githubAppDeleteSettingsUrl,
  githubAppInstallUrl,
  githubOAuthAuthorizeUrl,
  githubOAuthCallbackUrls,
  gitlabOAuthAuthorizeUrl,
  isPublicInternetUrl,
  randomOAuthState,
  safeReturnTo,
  sanitizeBrowserOrigin,
  uninstallAllGitHubAppInstallations,
} from "@/lib/core"
import {
  clearGitHubAppLocalState,
  clearGitLabOAuthLocalState,
  createOAuthState,
  deleteUserGitLink,
  hasGitHubAppInDatabase,
  listUserGitLinks,
  loadGitHubAppConfig,
  loadGitLabOAuthConfig,
  platformConfig,
  saveGitLabOAuthConfig,
} from "@/lib/git-auth"
import { assertInstanceAdmin } from "@/lib/access"

import { authedProcedure } from "./middleware"

export const connectionStatus = authedProcedure.handler(async ({ context }) => {
  const userId = context.session!.user.id
  const publicUrl = platformConfig.publicControlPlaneUrl
  const [app, gl, links, appInDb] = await Promise.all([
    loadGitHubAppConfig(),
    loadGitLabOAuthConfig(),
    listUserGitLinks(userId),
    hasGitHubAppInDatabase(),
  ])

  return {
    githubAppConfigured: Boolean(app),
    /** database = can remove fully; env = only from DEPLOW_GITHUB_APP_* */
    githubAppSource: app
      ? appInDb
        ? ("database" as const)
        : ("env" as const)
      : null,
    gitlabOAuthConfigured: Boolean(gl),
    installUrl: app ? githubAppInstallUrl(app.slug) : null,
    githubAppSlug: app?.slug ?? null,
    githubAppDeleteUrl: app ? githubAppDeleteSettingsUrl(app.slug) : null,
    /** Exact Callback URL(s) the GitHub App should list (copy into App settings if OAuth fails). */
    githubOAuthCallbackUrl: `${publicUrl}${GITHUB_OAUTH_CALLBACK_PATH}`,
    githubOAuthCallbackUrls: githubOAuthCallbackUrls(publicUrl),
    publicControlPlaneUrl: publicUrl,
    links: links.map((l) => ({
      provider: l.provider as "github" | "gitlab",
      login: l.login,
      avatarUrl: l.avatarUrl,
      githubInstallationId: l.githubInstallationId,
      connected: true as const,
    })),
  }
})

export const startOAuth = authedProcedure
  .input(startGitOAuthInputSchema)
  .handler(async ({ context, input }) => {
    const userId = context.session!.user.id
    const publicUrl = platformConfig.publicControlPlaneUrl
    const returnTo = safeReturnTo(input.returnTo, publicUrl)
    const state = randomOAuthState()

    if (input.provider === "github") {
      const app = await loadGitHubAppConfig()
      if (!app) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "GitHub isn’t set up on this server. Create a GitHub App under Integrations, or use a PAT under Advanced.",
        })
      }
      await createOAuthState({
        userId,
        provider: "github",
        returnTo,
        state,
      })
      // Do NOT send redirect_uri unless we know it is registered on the App.
      // A mismatched redirect_uri → GitHub "not associated with this application".
      // Omitting it makes GitHub use the App’s configured Callback URL(s).
      const url = githubOAuthAuthorizeUrl({
        clientId: app.clientId,
        state,
      })
      return { url, state }
    }

    const gl = await loadGitLabOAuthConfig()
    if (!gl) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "GitLab OAuth isn’t configured. Set DEPLOW_GITLAB_OAUTH_CLIENT_ID/SECRET (or save under Integrations), or use a PAT under Advanced.",
      })
    }
    await createOAuthState({
      userId,
      provider: "gitlab",
      returnTo,
      state,
    })
    const redirectUri = `${publicUrl}/api/git/oauth/gitlab/callback`
    const url = gitlabOAuthAuthorizeUrl({
      config: gl,
      redirectUri,
      state,
    })
    return { url, state }
  })

export const disconnectProvider = authedProcedure
  .input(z.object({ provider: z.enum(["github", "gitlab"]) }))
  .handler(async ({ context, input }) => {
    await deleteUserGitLink(context.session!.user.id, input.provider)
    return { ok: true as const }
  })

export const githubAppManifestStart = authedProcedure
  .input(
    z
      .object({
        /** Browser origin so GitHub redirects back to the same host the user is on. */
        origin: z.string().url().optional(),
      })
      .optional(),
  )
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    const configured = platformConfig.publicControlPlaneUrl
    const origin = sanitizeBrowserOrigin(input?.origin)
    // Prefer the public control-plane URL over a private LAN browser origin so
    // App callback/setup URLs are not registered as 192.168.x.x.
    const publicUrl =
      configured && isPublicInternetUrl(configured)
        ? configured
        : (origin ?? configured)
    const publicNet = isPublicInternetUrl(publicUrl)
    const extraOrigins: string[] = []
    if (origin && origin !== publicUrl) extraOrigins.push(origin)
    if (configured && configured !== publicUrl) extraOrigins.push(configured)
    const manifest = buildGitHubAppManifest({
      name: "Hostrig",
      publicUrl,
      extraCallbackOrigins: extraOrigins.length ? extraOrigins : undefined,
    })
    // GitHub expects POST form to https://github.com/settings/apps/new
    // with manifest JSON — client submits
    return {
      manifest,
      postUrl: "https://github.com/settings/apps/new",
      publicUrl,
      /**
       * When false, App-level webhook was omitted (localhost).
       * OAuth callbacks still work on localhost; use a tunnel for production hooks.
       */
      appWebhookIncluded: publicNet,
      warning: publicNet
        ? null
        : `DEPLOW_PUBLIC_URL / browser origin is "${publicUrl}" (not on the public Internet). GitHub rejects App webhook URLs on localhost — the manifest omits the App webhook. You can still create the App for OAuth/install tokens. For push-to-deploy from GitHub to a local machine, set DEPLOW_PUBLIC_URL to a tunnel (cloudflared, ngrok) and recreate, or add repo webhooks manually.`,
    }
  })

export const saveGitLabOAuth = authedProcedure
  .input(
    z.object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      baseUrl: z.string().url().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    await saveGitLabOAuthConfig({
      clientId: input.clientId.trim(),
      clientSecret: input.clientSecret.trim(),
      baseUrl: (input.baseUrl ?? "https://gitlab.com").replace(/\/$/, ""),
    })
    return { ok: true as const }
  })

/**
 * Remove GitHub App from Hostrig and best-effort clean up on GitHub.
 *
 * GitHub has no public API to delete the App *registration* — only installations.
 * We uninstall all installations, clear local credentials, and return a URL
 * to Advanced → Delete GitHub App on github.com.
 */
export const removeGitHubApp = authedProcedure
  .input(
    z
      .object({
        /** Uninstall from every account/org (default true) */
        uninstallRemote: z.boolean().optional(),
      })
      .optional(),
  )
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    const uninstallRemote = input?.uninstallRemote !== false
    const appInDb = await hasGitHubAppInDatabase()
    const app = await loadGitHubAppConfig()

    if (!app && !appInDb) {
      throw new ORPCError("BAD_REQUEST", {
        message: "No GitHub App is configured on this server.",
      })
    }

    let uninstalled: string[] = []
    let remoteErrors: string[] = []
    let deleteOnGitHubUrl: string | null = app
      ? githubAppDeleteSettingsUrl(app.slug)
      : "https://github.com/settings/apps"
    let appName: string | null = app?.slug ?? null
    let remoteAttempted = false

    if (app && uninstallRemote) {
      remoteAttempted = true
      try {
        const meta = await getAuthenticatedGitHubApp({ config: app })
        if (meta.slug) {
          deleteOnGitHubUrl = githubAppDeleteSettingsUrl(meta.slug)
          appName = meta.name || meta.slug
        }
        const result = await uninstallAllGitHubAppInstallations({ config: app })
        uninstalled = result.uninstalled
        remoteErrors = result.errors
      } catch (error) {
        remoteErrors.push(
          error instanceof Error ? error.message : String(error),
        )
      }
    }

    await clearGitHubAppLocalState()

    const stillFromEnv = Boolean(await loadGitHubAppConfig())

    return {
      ok: true as const,
      localCleared: true as const,
      remoteAttempted,
      uninstalled,
      remoteErrors,
      /**
       * Open this URL → Advanced → Delete GitHub App.
       * GitHub does not allow deleting the registration via API.
       */
      deleteOnGitHubUrl,
      appName,
      stillConfiguredFromEnv: stillFromEnv,
      message: stillFromEnv
        ? "Cleared stored App credentials, but DEPLOW_GITHUB_APP_* env vars are still set — unset them and restart to fully remove."
        : "GitHub App removed from Hostrig. Finish by deleting the App registration on GitHub (link provided).",
    }
  })

export const removeGitLabOAuth = authedProcedure.handler(async ({ context }) => {
  await assertInstanceAdmin(context.session!)
  await clearGitLabOAuthLocalState()
  return { ok: true as const }
})
