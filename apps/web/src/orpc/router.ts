import { os } from "@orpc/server"

import * as bindings from "./bindings"
import * as cluster from "./cluster"
import * as deployments from "./deployments"
import * as git from "./git"
import * as mcp from "./mcp"
import * as observe from "./observe"
import * as observeQuery from "./observe-query"
import * as operations from "./operations"
import * as organizations from "./organizations"
import * as edge from "./edge"
import * as platform from "./platform"
import * as projects from "./projects"
import * as registries from "./registries"
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
    meshOnboarding: platform.meshOnboarding,
    ingressGet: platform.ingressGet,
    ingressUpdate: platform.ingressUpdate,
  },
  edge: {
    netbirdStatus: edge.netbirdStatus,
    netbirdListManagedDomains: edge.netbirdListManagedDomains,
    netbirdConnect: edge.netbirdConnect,
    netbirdDisconnect: edge.netbirdDisconnect,
  },
  cluster: {
    get: cluster.get,
    connect: cluster.connect,
    disconnect: cluster.disconnect,
    createHetzner: cluster.createHetzner,
    addNode: cluster.addNode,
    removeNode: cluster.removeNode,
    getKubeconfig: cluster.getKubeconfig,
    getWorkerJoinScript: cluster.getWorkerJoinScript,
    storeJoinToken: cluster.storeJoinToken,
  },
  registries: {
    list: registries.list,
    create: registries.create,
    update: registries.update,
    delete: registries.remove,
    setDefaultBuild: registries.setDefaultBuild,
    syncToCluster: registries.syncToCluster,
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
  observe: {
    status: observe.status,
    projects: {
      get: observe.projectsGet,
      enable: observe.projectsEnable,
      setup: observe.projectsSetup,
      updateRetention: observeQuery.projectsUpdateRetention,
    },
    issues: {
      list: observe.issuesList,
      get: observe.issuesGet,
      updateStatus: observe.issuesUpdateStatus,
      updateTriage: observe.issuesUpdateTriage,
      bulkUpdateStatus: observe.issuesBulkUpdateStatus,
      trend: observe.issuesTrend,
      eventHistogram: observe.issuesEventHistogram,
      eventSeries: observe.issuesEventSeries,
    },
    events: {
      get: observe.eventsGet,
      listForIssue: observe.eventsListForIssue,
    },
    services: {
      list: observeQuery.servicesList,
      overview: observeQuery.servicesOverview,
      operations: observeQuery.servicesOperations,
      recentErrors: observeQuery.servicesRecentErrors,
    },
    traces: {
      list: observeQuery.tracesList,
      get: observeQuery.tracesGet,
      histogram: observeQuery.tracesHistogramQuery,
    },
    logs: {
      search: observeQuery.logsSearch,
      histogram: observeQuery.logsHistogramQuery,
    },
    charts: {
      series: observeQuery.chartsSeries,
    },
    explore: {
      heatmap: observeQuery.exploreHeatmap,
      selection: observeQuery.exploreSelection,
      anomalies: observeQuery.exploreAnomalies,
    },
    releases: {
      list: observeQuery.releasesList,
    },
    savedViews: {
      list: observeQuery.savedViewsList,
      create: observeQuery.savedViewsCreate,
      delete: observeQuery.savedViewsDelete,
    },
    dashboards: {
      list: observeQuery.dashboardsList,
      create: observeQuery.dashboardsCreate,
      get: observeQuery.dashboardsGet,
      update: observeQuery.dashboardsUpdate,
      delete: observeQuery.dashboardsDelete,
    },
    insights: {
      list: observeQuery.insightsList,
      get: observeQuery.insightsGet,
      create: observeQuery.insightsCreate,
      update: observeQuery.insightsUpdate,
      delete: observeQuery.insightsDelete,
      run: observeQuery.insightsRun,
    },
    trends: {
      run: observeQuery.trendsRun,
      export: observeQuery.trendsExport,
    },
    query: {
      run: observeQuery.queryRun,
      facets: observeQuery.queryFacets,
    },
    metrics: {
      catalog: observeQuery.metricsCatalog,
    },
    fields: {
      suggest: observeQuery.fieldsSuggest,
      values: observeQuery.fieldsValues,
    },
    alerts: {
      list: observeQuery.alertsList,
      create: observeQuery.alertsCreate,
      update: observeQuery.alertsUpdate,
      delete: observeQuery.alertsDelete,
      history: observeQuery.alertsHistory,
      evaluateNow: observeQuery.alertsEvaluateNow,
    },
    members: {
      list: observeQuery.membersList,
      upsert: observeQuery.membersUpsert,
    },
    export: {
      csv: observeQuery.exportCsv,
    },
  },
  messageChannels: {
    list: observeQuery.messageChannelsList,
    create: observeQuery.messageChannelsCreate,
    update: observeQuery.messageChannelsUpdate,
    delete: observeQuery.messageChannelsDelete,
    test: observeQuery.messageChannelsTest,
  },
}
