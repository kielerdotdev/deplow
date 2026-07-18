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
import {
  GitHostRegistry,
  type GitHostProvider,
  type GitWebhookDeleteInput,
  type GitWebhookRegisterInput,
  type GitWebhookRegisterResult,
} from "@/lib/git/host-provider"
import { platformConfig } from "@/lib/services"

export type RegisterServiceWebhookInput = GitWebhookRegisterInput & {
  provider: "github" | "gitlab"
}

export type RegisterServiceWebhookResult = GitWebhookRegisterResult

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

function earlyRegisterResult(
  input: GitWebhookRegisterInput,
): GitWebhookRegisterResult | null {
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
        "Control plane URL is not publicly reachable. Add a push webhook manually (set HOSTRIG_PUBLIC_URL to a tunnel for auto-register).",
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
  return null
}

async function resolveGithubToken(input: {
  userId: string
  installationId?: string | null
  accessToken?: string | null
}): Promise<string | null> {
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

async function resolveGitlabToken(input: {
  userId: string
  accessToken?: string | null
}): Promise<{
  token: string
  config: NonNullable<Awaited<ReturnType<typeof loadGitLabOAuthConfig>>>
} | null> {
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

export class GitHubWebhookProvider implements GitHostProvider {
  readonly id = "github" as const

  async registerWebhook(
    input: GitWebhookRegisterInput,
  ): Promise<GitWebhookRegisterResult> {
    const early = earlyRegisterResult(input)
    if (early) return early
    const webhookUrl = webhookUrlForService(input.serviceId)
    const parsed = parseRepoFullName(input.repoFullName || input.repoUrl)!
    try {
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

  async deleteWebhook(input: GitWebhookDeleteInput): Promise<void> {
    if (!input.repoUrl) return
    const parsed = parseRepoFullName(input.repoFullName || input.repoUrl)
    if (!parsed) return
    const token = await resolveGithubToken({
      userId: input.userId,
      installationId: input.installationId,
      accessToken: input.accessTokenEncrypted
        ? input.decryptAccessToken(input.accessTokenEncrypted)
        : null,
    })
    if (!token) return
    await deleteRepoWebhook({
      installationToken: token,
      owner: parsed.owner,
      repo: parsed.repo,
      hookId: input.remoteWebhookId,
    })
  }
}

export class GitLabWebhookProvider implements GitHostProvider {
  readonly id = "gitlab" as const

  async registerWebhook(
    input: GitWebhookRegisterInput,
  ): Promise<GitWebhookRegisterResult> {
    const early = earlyRegisterResult(input)
    if (early) return early
    const webhookUrl = webhookUrlForService(input.serviceId)
    const parsed = parseRepoFullName(input.repoFullName || input.repoUrl)!
    try {
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

  async deleteWebhook(input: GitWebhookDeleteInput): Promise<void> {
    if (!input.repoUrl) return
    const parsed = parseRepoFullName(input.repoFullName || input.repoUrl)
    if (!parsed) return
    const gitlab = await resolveGitlabToken({
      userId: input.userId,
      accessToken: input.accessTokenEncrypted
        ? input.decryptAccessToken(input.accessTokenEncrypted)
        : null,
    })
    if (!gitlab) return
    await deleteGitLabProjectHook({
      config: gitlab.config,
      accessToken: gitlab.token,
      projectId: parsed.fullName,
      hookId: input.remoteWebhookId,
    })
  }
}

const registry = new GitHostRegistry([
  new GitHubWebhookProvider(),
  new GitLabWebhookProvider(),
])

export function gitHostRegistry(): GitHostRegistry {
  return registry
}

export async function registerServiceWebhook(
  input: RegisterServiceWebhookInput,
): Promise<RegisterServiceWebhookResult> {
  const { provider, ...rest } = input
  return registry.get(provider).registerWebhook(rest)
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
  try {
    await registry.get(input.provider).deleteWebhook({
      userId: input.userId,
      remoteWebhookId: input.remoteWebhookId,
      repoUrl: input.repoUrl,
      repoFullName: input.repoFullName,
      installationId: input.installationId,
      accessTokenEncrypted: input.accessTokenEncrypted,
      decryptAccessToken: input.decryptAccessToken,
    })
  } catch (error) {
    console.warn(
      "[hostrig] failed to delete remote webhook:",
      error instanceof Error ? error.message : error,
    )
  }
}
