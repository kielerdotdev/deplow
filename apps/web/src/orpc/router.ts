import { os } from "@orpc/server"

import * as bindings from "./bindings"
import * as deployments from "./deployments"
import * as git from "./git"
import * as mcp from "./mcp"
import * as nodes from "./nodes"
import * as operations from "./operations"
import * as organizations from "./organizations"
import * as platform from "./platform"
import * as projects from "./projects"
import * as services from "./services"
import * as resourceLinks from "./resource-links"

export const health = os.handler(async () => ({
  ok: true as const,
  time: new Date().toISOString(),
}))

export const router = {
  health,
  organizations: {
    list: organizations.list,
    get: organizations.get,
    getActive: organizations.getActive,
    setActive: organizations.setActive,
    update: organizations.update,
    listMembers: organizations.listMembers,
    listInvites: organizations.listInvites,
    invite: organizations.invite,
    revokeInvite: organizations.revokeInvite,
    removeMember: organizations.removeMember,
    updateMemberRole: organizations.updateMemberRole,
    acceptInvite: organizations.acceptInvite,
    peekInvite: organizations.peekInvite,
    me: organizations.me,
  },
  platform: {
    proxyStatus: platform.proxyStatus,
    ingressGet: platform.ingressGet,
    ingressUpdate: platform.ingressUpdate,
    operatorWebhookGet: platform.operatorWebhookGet,
    operatorWebhookUpdate: platform.operatorWebhookUpdate,
  },
  projects: {
    list: projects.list,
    get: projects.get,
    create: projects.create,
    destroy: projects.destroy,
    secrets: projects.secrets,
    envSecrets: projects.envSecrets,
    saveEnvSecrets: projects.saveEnvSecrets,
    backup: projects.backup,
    listBackups: projects.listBackups,
    backupSchedule: projects.backupSchedule,
    restoreBackup: projects.restoreBackup,
    downloadBackup: projects.downloadBackup,
    pitrStatus: projects.pitrStatus,
    restorePitr: projects.restorePitr,
    databaseOverview: projects.databaseOverview,
    listPostgresRoles: projects.listPostgresRoles,
    createPostgresRole: projects.createPostgresRole,
    rotatePostgresRole: projects.rotatePostgresRole,
    dropPostgresRole: projects.dropPostgresRole,
    listRedisUsers: projects.listRedisUsers,
    createRedisUser: projects.createRedisUser,
    rotateRedisUser: projects.rotateRedisUser,
    dropRedisUser: projects.dropRedisUser,
    exportRedis: projects.exportRedis,
    importRedis: projects.importRedis,
    listGitRepos: services.listGitRepos,
    listGitBranches: services.listGitBranches,
    normalizeGitRepoUrl: services.normalizeGitRepoUrl,
  },
  services: {
    list: services.list,
    get: services.get,
    create: services.create,
    createAndDeploy: services.createAndDeploy,
    analyzeSource: services.analyzeSource,
    update: services.update,
    destroy: services.destroy,
    retryProvision: services.retryProvision,
    connectGit: services.connectGit,
    disconnectGit: services.disconnectGit,
    listGitRepos: services.listGitRepos,
    listGitBranches: services.listGitBranches,
    normalizeGitRepoUrl: services.normalizeGitRepoUrl,
  },
  bindings: {
    list: bindings.list,
    create: bindings.create,
    destroy: bindings.destroy,
  },
  operations: {
    list: operations.list,
    get: operations.get,
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
  mcp: {
    listTokens: mcp.listTokens,
    createToken: mcp.createToken,
    revokeToken: mcp.revokeToken,
  },
}
