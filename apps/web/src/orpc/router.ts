import { os } from "@orpc/server"

import * as deployments from "./deployments"
import * as nodes from "./nodes"
import * as projects from "./projects"

export const health = os.handler(async () => ({
  ok: true as const,
  time: new Date().toISOString(),
}))

export const router = {
  health,
  projects: {
    list: projects.list,
    get: projects.get,
    create: projects.create,
    destroy: projects.destroy,
    secrets: projects.secrets,
    backup: projects.backup,
    listBackups: projects.listBackups,
    backupSchedule: projects.backupSchedule,
    connectGit: projects.connectGit,
    disconnectGit: projects.disconnectGit,
    listGitRepos: projects.listGitRepos,
    listGitBranches: projects.listGitBranches,
    normalizeGitRepoUrl: projects.normalizeGitRepoUrl,
  },
  nodes: {
    list: nodes.list,
    register: nodes.register,
    remove: nodes.remove,
    status: nodes.status,
    ensureLocal: nodes.ensureLocal,
  },
  deployments: {
    list: deployments.list,
    get: deployments.get,
    create: deployments.create,
    logs: deployments.logs,
    stop: deployments.stop,
    retry: deployments.retry,
    rollback: deployments.rollback,
  },
}
