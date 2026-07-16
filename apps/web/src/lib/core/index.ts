export type { DeployOptions, NodeExecutor, NodeStatus } from "./node-executor"
export type { DeployResult } from "./node-executor"
export { DockerNodeExecutor } from "./docker-node-executor"
export type { DockerNodeRecord } from "./docker-node-executor"
export {
  imageRetainCount,
  retainAndPruneDeployImages,
  selectRollbackTarget,
} from "./image-retain"
export { SshNodeExecutor } from "./ssh-node-executor"
export type {
  ServerSpawner,
  SpawnedServer,
  SpawnedServerStatus,
  SpawnOptions,
} from "./spawners/base"
export {
  createServerSpawners,
  getServerSpawner,
  listServerSpawnerProviders,
} from "./spawners/factory"
export { HetznerSpawner } from "./spawners/hetzner"
export { DockerSpawner } from "./spawners/docker"
export { SecretsService } from "./secrets.service"
export type { SecretsInput } from "./secrets.service"
export { ProvisioningService } from "./provisioning.service"
export { ResourceLinkService } from "./resource-link.service"
export {
  DataServiceRegistry,
  DataContainerRuntime,
  PostgresContainerDriver,
  RedisContainerDriver,
  S3SharedDriver,
} from "./data-services"
export type {
  DataServiceDriver,
  BackupCapable,
  PitrCapable,
  PrincipalsCapable,
  ResourceCapabilities,
  ProvisionContext,
  DestroyContext,
} from "./data-services"
export type { BackupTarget } from "./backup.service"
export type {
  CreateProjectResult,
  DestroyProjectInput,
} from "./provisioning.service"
export { BackupService } from "./backup.service"
export type { BackupRecord, BackupStore, BackupKind } from "./backup.service"
export { BackupScheduler } from "./backup-scheduler"
export type { ScheduledProject } from "./backup-scheduler"
export { PitrService } from "./pitr.service"
export type { PitrWindow } from "./pitr.service"
export {
  BuildService,
  selectBuildStrategy,
  detectDockerfile,
  resolveRootDirectory,
  resolveDockerfilePath,
  resolveDockerfileAbsolute,
  prepareRailpackNodeLockfiles,
} from "./build.service"
export type {
  BuildResult,
  BuildSelectionInput,
  BuildStrategy,
  BuildStrategyOverride,
  BuildFromSourceInput,
} from "./build.service"
export {
  analyzeDirectory,
  analyzeRemote,
  assertAnalysisFresh,
  cacheAnalysis,
  clearAnalysisCache,
  findApplicationRoots,
  findDockerfiles,
  fingerprintAnalysis,
  fingerprintsMatch,
  getCachedAnalysis,
  toPublicAnalysis,
} from "./source-analysis.service"
export type {
  AnalysisFingerprint,
  AnalysisNeedsChoice,
  AnalyzeDirectoryInput,
  AnalyzeRemoteInput,
  BuildStrategyChoice,
  SourceAnalysisResult,
} from "./source-analysis.service"
export {
  waitForServiceHealth,
  extractPortFromLogs,
  formatHealthError,
} from "./health-check"
export type { HealthCheckInput, HealthCheckResult } from "./health-check"
export { loadPlatformConfig } from "./platform-config"
export type { PlatformConfig } from "./platform-config"
export {
  injectDeployEnv,
  injectDeployEnvFromBindings,
  containerRuntimeEnv,
  buildDatabaseUrl,
  buildRedisUrl,
} from "./inject-env"
export type { BindingEnvInput } from "./inject-env"
export {
  enqueueDeploy,
  enqueueProvision,
  enqueueBackup,
  enqueueRestore,
  enqueueDestroy,
  enqueueObserveDigest,
  startQueueWorkers,
  closeQueueWorkers,
  QUEUE_NAMES,
} from "./queue"
export type {
  DeployJobData,
  ProvisionJobData,
  BackupJobData,
  RestoreJobData,
  DestroyJobData,
  ObserveDigestJobData,
} from "./queue"
export {
  createOperation,
  markOperationQueued,
  markOperationRunning,
  markOperationSucceeded,
  markOperationFailed,
  updateOperationStage,
  reclaimStaleOperations,
  toOperationSummary,
} from "./queue/operations"
// Processors import @/lib/services — keep them out of this barrel (SSR init cycle).
export { normalizeProductionStartCommand, isRailpackCaddyCommand } from "./normalize-start-command"
export { encryptString, decryptString, randomPassword } from "./crypto"
export { PostgresProvisioner } from "./infra/postgres"
export { RedisProvisioner } from "./infra/redis"
export { StorageProvisioner } from "./infra/storage"
export {
  createS3Adapter,
  r2EndpointForAccount,
  type S3Adapter,
  type S3AdapterConfig,
  type S3ProviderKind,
} from "./infra/s3"
export { productionSlot, slotResourceName, slotLabel } from "./slot"
export type { ResourceSlot, SlotKind } from "./slot"
export {
  PREVIEW_HOSTNAME_PREFIX,
  productionHostname,
  productionPublicUrl,
  previewHostname,
  slugCollidesWithPreviewPrefix,
  assertProductionSlug,
} from "./proxy-hostname"
export { ProxyService } from "./proxy.service"
export type { ProxyRoute, ProxyServiceOptions } from "./proxy.service"
export {
  reloadCaddyProxy,
  createCaddyReloadOnChange,
  getLastCaddyReload,
  probeCaddyProxy,
  resetLastCaddyReload,
} from "./caddy-reload"
export type {
  CaddyReloadOptions,
  CaddyReloadResult,
  CaddyProbeResult,
} from "./caddy-reload"
export {
  handleGitWebhook,
  gitWebhookResultToResponse,
} from "./git-webhook-handler"
export type {
  GitWebhookHandlerDeps,
  GitWebhookService,
  GitWebhookProject,
  GitWebhookResult,
} from "./git-webhook-handler"
export {
  buildUserAppHostConfig,
  missingRuntimeError,
  parseRuntimeLimits,
} from "./host-config"
export type { AppRuntimeLimits, UserAppHostConfigInput } from "./host-config"
export {
  verifyGitHubSignature,
  verifyGitLabToken,
  verifyWebhookSignature,
  branchFromRef,
  extractPushBranch,
  extractChangedFiles,
  shouldDeployForWatchPaths,
  detectGitProvider,
} from "./webhook-signature"
export type { GitProvider } from "./webhook-signature"
export {
  MAX_WEBHOOK_BODY_BYTES,
  isWebhookBodyTooLarge,
} from "./doctor"
export { GitService } from "./git.service"
export type {
  GitConnectResult,
  GitCloneResult,
  GitSyncAuth,
} from "./git.service"
export {
  listRemoteRepos,
  listRemoteBranches,
  normalizeRepoUrl,
} from "./git-remote"
export type { RemoteRepo, ListReposResult } from "./git-remote"
export {
  gitAuthConfigEnv,
  hostFromRepoUrl,
  defaultGitUsername,
  authenticatedCloneUrl,
  redactSecrets,
} from "./git-clone-auth"
export type { GitCloneAuth } from "./git-clone-auth"
export {
  resolveProjectCloneAuth,
  resolveUserListToken,
  STALE_GITHUB_CREDS_MESSAGE,
  STALE_GITLAB_CREDS_MESSAGE,
} from "./git-credentials"
export type {
  ProjectGitAuthRow,
  GitProviderLinkRow,
  ResolveGitAuthDeps,
} from "./git-credentials"
export {
  createGitHubAppJwt,
  getInstallationAccessToken,
  listInstallationRepos,
  listUserInstallations,
  exchangeGitHubOAuthCode,
  fetchGitHubUser,
  createRepoWebhook,
  deleteRepoWebhook,
  githubOAuthAuthorizeUrl,
  githubAppInstallUrl,
  githubAppDeleteSettingsUrl,
  getAuthenticatedGitHubApp,
  listAppInstallations,
  uninstallAllGitHubAppInstallations,
  buildGitHubAppManifest,
  completeGitHubAppManifest,
  isPublicInternetUrl,
  randomOAuthState,
  githubOAuthCallbackUrls,
  redirectBaseFromRequest,
  sanitizeBrowserOrigin,
  GITHUB_OAUTH_CALLBACK_PATH,
} from "./github-app"
export type { GitHubAppConfig } from "./github-app"
export {
  gitlabOAuthAuthorizeUrl,
  exchangeGitLabOAuthCode,
  refreshGitLabToken,
  fetchGitLabUser,
  createGitLabProjectHook,
  deleteGitLabProjectHook,
} from "./gitlab-oauth"
export type { GitLabOAuthConfig } from "./gitlab-oauth"
export {
  githubAppConfigFromEnv,
  gitlabOAuthConfigFromEnv,
  parseRepoFullName,
  safeReturnTo,
} from "./git-integrations"
