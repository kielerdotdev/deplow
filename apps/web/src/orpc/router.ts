import { os } from "@orpc/server"

import * as deployments from "./deployments"
import * as git from "./git"
import * as nodes from "./nodes"
import * as projects from "./projects"
import * as services from "./services"
import * as resourceLinks from "./resource-links"

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
    listGitRepos: services.listGitRepos,
    listGitBranches: services.listGitBranches,
    normalizeGitRepoUrl: services.normalizeGitRepoUrl,
  },
  services: {
    list: services.list,
    get: services.get,
    create: services.create,
    update: services.update,
    destroy: services.destroy,
    connectGit: services.connectGit,
    disconnectGit: services.disconnectGit,
    listGitRepos: services.listGitRepos,
    listGitBranches: services.listGitBranches,
    normalizeGitRepoUrl: services.normalizeGitRepoUrl,
  },
  resourceLinks: {
    list: resourceLinks.list,
  },
  git: {
    connectionStatus: git.connectionStatus,
    startOAuth: git.startOAuth,
    disconnectProvider: git.disconnectProvider,
    githubAppManifestStart: git.githubAppManifestStart,
    removeGitHubApp: git.removeGitHubApp,
    saveGitLabOAuth: git.saveGitLabOAuth,
    removeGitLabOAuth: git.removeGitLabOAuth,
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
