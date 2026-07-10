/**
 * Git connection + clone helpers for webhook production deploys.
 * Framework-agnostic (no oRPC / React).
 */

import { spawn } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import path from "node:path"

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
}

export class GitService {
  constructor(
    private readonly cloneRoot: string,
    private readonly runCommand: (
      cmd: string,
      args: string[],
      cwd?: string,
    ) => Promise<{ code: number; stdout: string; stderr: string }> = defaultRun,
  ) {
    mkdirSync(this.cloneRoot, { recursive: true })
  }

  generateWebhookSecret(): string {
    return randomPassword(32)
  }

  /**
   * Clone or fetch+reset the production branch into a project-specific dir.
   */
  async syncRepo(input: {
    projectId: string
    repoUrl: string
    branch: string
  }): Promise<GitCloneResult> {
    const dest = path.join(this.cloneRoot, input.projectId)
    const logs: string[] = []

    if (existsSync(path.join(dest, ".git"))) {
      const fetch = await this.runCommand(
        "git",
        ["fetch", "origin", input.branch],
        dest,
      )
      logs.push(fetch.stdout, fetch.stderr)
      if (fetch.code !== 0) {
        // re-clone on fetch failure
        rmSync(dest, { recursive: true, force: true })
      } else {
        const reset = await this.runCommand(
          "git",
          ["reset", "--hard", `origin/${input.branch}`],
          dest,
        )
        logs.push(reset.stdout, reset.stderr)
        if (reset.code !== 0) {
          throw new Error(
            `git reset failed: ${reset.stderr || reset.stdout}`.trim(),
          )
        }
        return { sourcePath: dest, logs: logs.filter(Boolean).join("\n") }
      }
    }

    mkdirSync(this.cloneRoot, { recursive: true })
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true })
    }

    const clone = await this.runCommand("git", [
      "clone",
      "--depth",
      "1",
      "--branch",
      input.branch,
      input.repoUrl,
      dest,
    ])
    logs.push(clone.stdout, clone.stderr)
    if (clone.code !== 0) {
      throw new Error(
        `git clone failed: ${clone.stderr || clone.stdout}`.trim(),
      )
    }
    return { sourcePath: dest, logs: logs.filter(Boolean).join("\n") }
  }

  detectProvider(repoUrl: string): GitProvider {
    if (repoUrl.includes("gitlab")) return "gitlab"
    return "github"
  }
}

function defaultRun(
  cmd: string,
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString()
    })
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
    child.on("error", (err) => {
      resolve({ code: 1, stdout, stderr: err.message })
    })
  })
}
