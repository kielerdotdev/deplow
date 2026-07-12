/**
 * Git connection + clone helpers for webhook production deploys.
 * Framework-agnostic (no oRPC / React).
 */

import { spawn } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import path from "node:path"

import {
  defaultGitUsername,
  gitAuthConfigEnv,
  hostFromRepoUrl,
  redactSecrets,
  type GitCloneAuth,
} from "./git-clone-auth"
import type { GitProvider } from "./webhook-signature"
import { randomPassword } from "./crypto"

export interface GitConnectResult {
  provider: GitProvider
  repoUrl: string
  branch: string
  webhookSecret: string
}

export interface GitCloneResult {
  sourcePath: string
  logs: string
  commitSha?: string | null
}

export type GitSyncAuth = GitCloneAuth & {
  /** github | gitlab — picks default username when omitted */
  provider?: string
}

export type GitSyncAuth = GitCloneAuth & {
  /** github | gitlab — picks default username when omitted */
  provider?: string
}

export class GitService {
  constructor(
    private readonly cloneRoot: string,
    private readonly runCommand: (
      cmd: string,
      args: string[],
      cwd?: string,
      env?: Record<string, string>,
    ) => Promise<{ code: number; stdout: string; stderr: string }> = defaultRun,
  ) {
    mkdirSync(this.cloneRoot, { recursive: true })
  }

  generateWebhookSecret(): string {
    return randomPassword(32)
  }

  /**
   * Clone or fetch+reset the production branch into a project-specific dir.
   * Pass `auth` for private repos (installation token / OAuth / PAT).
   */
  async syncRepo(input: {
    projectId: string
    repoUrl: string
    branch: string
    auth?: GitSyncAuth
  }): Promise<GitCloneResult> {
    const dest = path.join(this.cloneRoot, input.projectId)
    const secrets = input.auth?.token ? [input.auth.token] : []
    const env = this.buildAuthEnv(input.repoUrl, input.auth)

    if (existsSync(path.join(dest, ".git"))) {
      const fetched = await this.tryFetchAndReset(
        dest,
        input.branch,
        env,
        secrets,
      )
      if (fetched) return fetched
    }

    // Fresh clone (or fetch failed → wipe and re-clone)
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true })
    }
    mkdirSync(this.cloneRoot, { recursive: true })

    return this.cloneFresh(dest, input.repoUrl, input.branch, env, secrets)
  }

  detectProvider(repoUrl: string): GitProvider {
    if (repoUrl.includes("gitlab")) return "gitlab"
    return "github"
  }

  // ── internal ──────────────────────────────────────────────────

  private buildAuthEnv(
    repoUrl: string,
    auth?: GitSyncAuth,
  ): Record<string, string> | undefined {
    if (!auth?.token) return undefined
    const host = auth.host ?? hostFromRepoUrl(repoUrl)
    const username =
      auth.username ??
      defaultGitUsername(
        auth.provider ?? (host.includes("gitlab") ? "gitlab" : "github"),
      )
    return gitAuthConfigEnv({ token: auth.token, username, host })
  }

  private async tryFetchAndReset(
    dest: string,
    branch: string,
    env: Record<string, string> | undefined,
    secrets: string[],
  ): Promise<GitCloneResult | null> {
    const logs: string[] = []

    const fetch = await this.runCommand(
      "git",
      ["fetch", "origin", branch],
      dest,
      env,
    )
    pushLog(logs, fetch, secrets)
    if (fetch.code !== 0) {
      rmSync(dest, { recursive: true, force: true })
      return null
    }

    const reset = await this.runCommand(
      "git",
      ["reset", "--hard", `origin/${branch}`],
      dest,
      env,
    )
    pushLog(logs, reset, secrets)
    if (reset.code !== 0) {
      throw new Error(
        redactSecrets(
          `git reset failed: ${reset.stderr || reset.stdout}`.trim(),
          secrets,
        ),
      )
    }
    const sha = await this.readCommitSha(dest, env)
    return {
      sourcePath: dest,
      logs: logs.filter(Boolean).join("\n"),
      commitSha: sha,
    }
  }

  private async cloneFresh(
    dest: string,
    repoUrl: string,
    branch: string,
    env: Record<string, string> | undefined,
    secrets: string[],
  ): Promise<GitCloneResult> {
    const clone = await this.runCommand(
      "git",
      ["clone", "--depth", "1", "--branch", branch, repoUrl, dest],
      undefined,
      env,
    )

    const logs: string[] = []
    pushLog(logs, clone, secrets)
    if (clone.code !== 0) {
      throw new Error(
        redactSecrets(
          `git clone failed: ${clone.stderr || clone.stdout}`.trim(),
          secrets,
        ),
      )
    }
    const sha = await this.readCommitSha(dest, env)
    return {
      sourcePath: dest,
      logs: logs.filter(Boolean).join("\n"),
      commitSha: sha,
    }
  }

  private async readCommitSha(
    dest: string,
    env: Record<string, string> | undefined,
  ): Promise<string | null> {
    const rev = await this.runCommand(
      "git",
      ["rev-parse", "HEAD"],
      dest,
      env,
    )
    if (rev.code !== 0) return null
    return rev.stdout.trim() || null
  }
}

function pushLog(
  logs: string[],
  result: { stdout: string; stderr: string },
  secrets: string[],
): void {
  logs.push(
    redactSecrets(result.stdout, secrets),
    redactSecrets(result.stderr, secrets),
  )
}

function defaultRun(
  cmd: string,
  args: string[],
  cwd?: string,
  extraEnv?: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()))
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()))
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }))
    child.on("error", (err) =>
      resolve({ code: 1, stdout, stderr: err.message }),
    )
  })
}