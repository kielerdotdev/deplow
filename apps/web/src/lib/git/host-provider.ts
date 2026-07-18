export type GitHostId = "github" | "gitlab"

export type GitWebhookRegisterInput = {
  userId: string
  serviceId: string
  repoUrl: string
  repoFullName?: string | null
  installationId?: string | null
  accessToken?: string | null
  secret: string
  autoWebhook?: boolean
}

export type GitWebhookRegisterResult = {
  remoteWebhookId: string | null
  webhookManaged: boolean
  webhookUrl: string
  warning: string | null
}

export type GitWebhookDeleteInput = {
  userId: string
  remoteWebhookId: string
  repoUrl: string | null
  repoFullName: string | null
  installationId: string | null
  accessTokenEncrypted: string | null
  decryptAccessToken: (encrypted: string) => string
}

export interface GitHostProvider {
  readonly id: GitHostId
  registerWebhook(
    input: GitWebhookRegisterInput,
  ): Promise<GitWebhookRegisterResult>
  deleteWebhook(input: GitWebhookDeleteInput): Promise<void>
}

export class GitHostRegistry {
  private readonly providers: Map<GitHostId, GitHostProvider>

  constructor(providers: GitHostProvider[]) {
    this.providers = new Map(providers.map((p) => [p.id, p]))
  }

  get(id: GitHostId): GitHostProvider {
    const p = this.providers.get(id)
    if (!p) throw new Error(`No git host provider: ${id}`)
    return p
  }
}
