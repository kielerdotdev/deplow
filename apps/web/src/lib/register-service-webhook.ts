/**
 * Register / delete remote git push webhooks for a service.
 * Best-effort: localhost / missing scopes → manual setup (webhookManaged false).
 */

import {
  createGitLabProjectHook,
  createRepoWebhook,
  deleteGitLabProjectHook,
  deleteRepoWebhook,
  getInstallationAccessToken,
  parseRepoFullName,
} from "@/lib/core"
import {
  loadGitHubAppConfig,
  loadGitLabOAuthConfig,
  resolveListTokenForUser,
} from "@/lib/git-auth"
import { platformConfig } from "@/lib/services"

export type RegisterServiceWebhookInput = {
  userId: string
  serviceId: string
  provider: "github" | "gitlab"
  repoUrl: string
  repoFullName?: string | null
  installationId?: string | null
  accessToken?: string | null
  secret: string
  /** Skip remote API when false */
  autoWebhook?: boolean
}

export type RegisterServiceWebhookResult = {
  remoteWebhookId: string | null
  webhookManaged: boolean
  webhookUrl: string
  /** Shown when auto-register failed or skipped — operator pastes hook manually */
  warning: string | null
}

function webhookUrlForService(serviceId: string): string {
  const base = platformConfig.publicControlPlaneUrl.replace(/\/$/, "")
  return `${base}/api/webhooks/git/${serviceId}`
}

function isLocalPublicUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".localhost")
    )
  } catch {
    return true
  }
}

export async function registerServiceWebhook(
  input: RegisterServiceWebhookInput,
): Promise<RegisterServiceWebhookResult> {
  const webhookUrl = webhookUrlForService(input.serviceId)

  if (input.autoWebhook === false) {
    return {
      remoteWebhookId: null,
      webhookManaged: false,
      webhookUrl,
      warning:
        "Auto webhook disabled. Add a push webhook in your repo settings using the URL and secret.",
    }
  }

  if (isLocalPublicUrl(webhookUrl)) {
    return {
      remoteWebhookId: null,
      webhookManaged: false,
      webhookUrl,
      warning:
        "Control plane URL is not publicly reachable. Add a push webhook manually (set DEPLOW_PUBLIC_URL to a tunnel for auto-register).",
    }
  }

  const parsed = parseRepoFullName(input.repoFullName || input.repoUrl)
  if (!parsed) {
    return {
      remoteWebhookId: null,
      webhookManaged: false,
      webhookUrl,
      warning:
        "Could not parse repository name for webhook registration. Add the hook manually.",
    }
  }

  try {
    if (input.provider === "github") {
      const token = await resolveGithubToken(input)
      if (!token) {
        return {
          remoteWebhookId: null,
          webhookManaged: false,
          webhookUrl,
          warning:
            "No GitHub token available to create the webhook. Add a push webhook manually.",
        }
      }
      const hook = await createRepoWebhook({
        installationToken: token,
        owner: parsed.owner,
        repo: parsed.repo,
        webhookUrl,
        secret: input.secret,
      })
      return {
        remoteWebhookId: hook.id,
        webhookManaged: true,
        webhookUrl,
        warning: null,
      }
    }

    const gitlab = await resolveGitlabToken(input)
    if (!gitlab) {
      return {
        remoteWebhookId: null,
        webhookManaged: false,
        webhookUrl,
        warning:
          "No GitLab token available to create the webhook. Add a push webhook manually.",
      }
    }
    const hook = await createGitLabProjectHook({
      config: gitlab.config,
      accessToken: gitlab.token,
      projectId: parsed.fullName,
      webhookUrl,
      secret: input.secret,
    })
    return {
      remoteWebhookId: hook.id,
      webhookManaged: true,
      webhookUrl,
      warning: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      remoteWebhookId: null,
      webhookManaged: false,
      webhookUrl,
      warning: `Could not register webhook automatically (${message}). Add a push webhook manually using the URL and secret.`,
    }
  }
}

export async function deleteServiceWebhook(input: {
  userId: string
  provider: "github" | "gitlab" | null
  repoUrl: string | null
  repoFullName: string | null
  installationId: string | null
  accessTokenEncrypted: string | null
  remoteWebhookId: string | null
  decryptAccessToken: (encrypted: string) => string
}): Promise<void> {
  if (!input.remoteWebhookId || !input.provider || !input.repoUrl) return
  const parsed = parseRepoFullName(input.repoFullName || input.repoUrl)
  if (!parsed) return

  try {
    if (input.provider === "github") {
      const token = await resolveGithubToken({
        userId: input.userId,
        provider: "github",
        installationId: input.installationId,
        accessToken: input.accessTokenEncrypted
          ? input.decryptAccessToken(input.accessTokenEncrypted)
          : null,
        serviceId: "",
        repoUrl: input.repoUrl,
        secret: "",
      })
      if (!token) return
      await deleteRepoWebhook({
        installationToken: token,
        owner: parsed.owner,
        repo: parsed.repo,
        hookId: input.remoteWebhookId,
      })
      return
    }

    const gitlab = await resolveGitlabToken({
      userId: input.userId,
      provider: "gitlab",
      accessToken: input.accessTokenEncrypted
        ? input.decryptAccessToken(input.accessTokenEncrypted)
        : null,
      serviceId: "",
      repoUrl: input.repoUrl,
      secret: "",
    })
    if (!gitlab) return
    await deleteGitLabProjectHook({
      config: gitlab.config,
      accessToken: gitlab.token,
      projectId: parsed.fullName,
      hookId: input.remoteWebhookId,
    })
  } catch (error) {
    console.warn(
      "[deplow] failed to delete remote webhook:",
      error instanceof Error ? error.message : error,
    )
  }
}

async function resolveGithubToken(
  input: Pick<
    RegisterServiceWebhookInput,
    "userId" | "installationId" | "accessToken"
  >,
): Promise<string | null> {
  if (input.installationId) {
    const config = await loadGitHubAppConfig()
    if (config) {
      const { token } = await getInstallationAccessToken({
        config,
        installationId: input.installationId,
      })
      return token
    }
  }
  if (input.accessToken?.trim()) return input.accessToken.trim()
  try {
    const auth = await resolveListTokenForUser({
      userId: input.userId,
      provider: "github",
      installationId: input.installationId ?? undefined,
    })
    return auth.token
  } catch {
    return null
  }
}

async function resolveGitlabToken(
  input: Pick<RegisterServiceWebhookInput, "userId" | "accessToken">,
): Promise<{ token: string; config: NonNullable<
  Awaited<ReturnType<typeof loadGitLabOAuthConfig>>
> } | null> {
  const config = await loadGitLabOAuthConfig()
  if (!config) return null
  if (input.accessToken?.trim()) {
    return { token: input.accessToken.trim(), config }
  }
  try {
    const auth = await resolveListTokenForUser({
      userId: input.userId,
      provider: "gitlab",
    })
    return { token: auth.token, config }
  } catch {
    return null
  }
}
