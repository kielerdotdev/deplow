import {
  and,
  backups,
  db,
  deployments,
  desc,
  eq,
  inArray,
  nodes,
  operations,
  or,
  projects,
  resourceLinks,
  serviceBindings,
  services,
} from "@deplow/db"
import type {
  DatabaseCredentials,
  ProjectCredentials,
  RedisCredentials,
  ResourceKind,
  StorageCredentials,
} from "@deplow/shared"

import {
  BackupScheduler,
  BackupService,
  type BackupRecord,
  type BackupStore,
  type BackupTarget,
  BuildService,
  buildDatabaseUrl,
  buildRedisUrl,
  type BindingEnvInput,
  decryptString,
  DockerNodeExecutor,
  GitService,
  PitrService,
  PostgresProvisioner,
  ProxyService,
  ProvisioningService,
  RedisProvisioner,
  ResourceLinkService,
  createCaddyReloadOnChange,
  createOperation,
  enqueueProvision,
  loadPlatformConfig,
  markOperationQueued,
  reclaimStaleOperations,
  startQueueWorkers,
} from "@/lib/core"
import { env } from "@/lib/env"

const config = loadPlatformConfig()

const backupStore: BackupStore = {
  async createRunning(
    projectId,
    storageKey,
    kind = "snapshot",
    targetAt = null,
    resourceLinkId = null,
    serviceId = null,
  ) {
    const id = crypto.randomUUID()
    const linkId =
      resourceLinkId && resourceLinkId.length > 0 ? resourceLinkId : null
    await db.insert(backups).values({
      id,
      projectId,
      resourceLinkId: linkId,
      serviceId: serviceId || null,
      storageKey,
      status: "running",
      kind: kind === "postgres" ? "snapshot" : kind,
      targetAt: targetAt ?? null,
    })
    return {
      id,
      projectId,
      resourceLinkId: linkId,
      serviceId: serviceId || null,
      storageKey,
      sizeBytes: 0,
      status: "running",
      kind,
      targetAt,
    }
  },
  async complete(id, sizeBytes) {
    const [row] = await db.select().from(backups).where(eq(backups.id, id))
    await db
      .update(backups)
      .set({ status: "completed", sizeBytes })
      .where(eq(backups.id, id))
    if (
      row &&
      (row.kind === "snapshot" ||
        row.kind === "postgres" ||
        row.kind === "redis")
    ) {
      await db
        .update(projects)
        .set({ lastBackupAt: new Date() })
        .where(eq(projects.id, row.projectId))
    }
  },
  async fail(id, message) {
    await db
      .update(backups)
      .set({ status: "failed", errorMessage: message })
      .where(eq(backups.id, id))
  },
  async get(id) {
    const [r] = await db.select().from(backups).where(eq(backups.id, id))
    if (!r) return null
    return {
      id: r.id,
      projectId: r.projectId,
      resourceLinkId: r.resourceLinkId,
      serviceId: r.serviceId,
      storageKey: r.storageKey,
      sizeBytes: r.sizeBytes ?? 0,
      status: r.status,
      kind: r.kind as BackupRecord["kind"],
      targetAt: r.targetAt,
      errorMessage: r.errorMessage ?? undefined,
      createdAt: r.createdAt?.toISOString?.() ?? undefined,
    }
  },
  async list(projectId, limit = BackupService.retainCount(), targetId) {
    const rows = await db
      .select()
      .from(backups)
      .where(
        targetId
          ? and(
              eq(backups.projectId, projectId),
              or(
                eq(backups.resourceLinkId, targetId),
                eq(backups.serviceId, targetId),
              ),
            )
          : eq(backups.projectId, projectId),
      )
      .orderBy(desc(backups.createdAt))
      .limit(limit)
    return rows.map(
      (r): BackupRecord => ({
        id: r.id,
        projectId: r.projectId,
        resourceLinkId: r.resourceLinkId,
        serviceId: r.serviceId,
        storageKey: r.storageKey,
        sizeBytes: r.sizeBytes ?? 0,
        status: r.status,
        kind: r.kind as BackupRecord["kind"],
        targetAt: r.targetAt,
        errorMessage: r.errorMessage ?? undefined,
        createdAt: r.createdAt?.toISOString?.() ?? undefined,
      }),
    )
  },
  async listExpired(projectId, keep, targetId) {
    const rows = await db
      .select()
      .from(backups)
      .where(
        targetId
          ? and(
              eq(backups.projectId, projectId),
              or(
                eq(backups.resourceLinkId, targetId),
                eq(backups.serviceId, targetId),
              ),
            )
          : eq(backups.projectId, projectId),
      )
      .orderBy(desc(backups.createdAt))
      .offset(Math.max(0, keep))
    return rows.map(
      (r): BackupRecord => ({
        id: r.id,
        projectId: r.projectId,
        resourceLinkId: r.resourceLinkId,
        serviceId: r.serviceId,
        storageKey: r.storageKey,
        sizeBytes: r.sizeBytes ?? 0,
        status: r.status,
        kind: r.kind as BackupRecord["kind"],
        errorMessage: r.errorMessage ?? undefined,
      }),
    )
  },
  async deleteMany(ids) {
    if (ids.length === 0) return
    const chunkSize = 400
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
      await db.delete(backups).where(inArray(backups.id, chunk))
    }
  },
  async getLastBackupAt(projectId) {
    const [row] = await db
      .select({ lastBackupAt: projects.lastBackupAt })
      .from(projects)
      .where(eq(projects.id, projectId))
    return row?.lastBackupAt ?? null
  },
  async getIntervalMs(projectId) {
    const [row] = await db
      .select({ backupIntervalMs: projects.backupIntervalMs })
      .from(projects)
      .where(eq(projects.id, projectId))
    return row?.backupIntervalMs ?? null
  },
}

export const platformConfig = config

export const provisioningService = new ProvisioningService(config, undefined)

export const resourceLinkService = new ResourceLinkService(config)

export const backupService = new BackupService(config, backupStore)

export const pitrService = new PitrService(config, backupStore)

export const postgresProvisioner = new PostgresProvisioner(config)

export const redisProvisioner = new RedisProvisioner(config)

const globalForBackups = globalThis as typeof globalThis & {
  __deplowBackupScheduler?: BackupScheduler
}

if (globalForBackups.__deplowBackupScheduler) {
  globalForBackups.__deplowBackupScheduler.stopAll()
}
export const backupScheduler = (globalForBackups.__deplowBackupScheduler =
  new BackupScheduler(backupService))

export const buildService = new BuildService({
  railpackBin: process.env.RAILPACK_BIN ?? "railpack",
  buildkitHost: process.env.BUILDKIT_HOST ?? "docker-container://buildkit",
})

export const dockerNodeExecutor = new DockerNodeExecutor(
  config,
  async (nodeId) => {
    const [row] = await db.select().from(nodes).where(eq(nodes.id, nodeId))
    if (!row || row.provider !== "docker") return null
    return { id: row.id, name: row.name, host: row.host }
  },
)

export const proxyService = new ProxyService({
  routesDir: config.proxyRoutesDir,
  baseDomain: "",
  publicProtocol: config.publicUrlProtocol,
  autoDomainsEnabled: true,
  onChange: createCaddyReloadOnChange({
    containerName: process.env.DEPLOW_CADDY_CONTAINER ?? "deplow-caddy",
  }),
})

// Seed / load app-managed ingress settings (env only seeds when DB empty)
void import("@/lib/ingress-settings")
  .then(({ loadIngressSettings }) => loadIngressSettings())
  .then((settings) => {
    proxyService.applySettings(settings)
  })
  .catch((err) => {
    console.warn("[deplow] failed to load ingress settings:", err)
    proxyService.applySettings({
      baseDomain: config.baseDomain,
      publicProtocol: config.publicUrlProtocol,
      autoDomainsEnabled: Boolean(config.baseDomain),
    })
  })

export const gitService = new GitService(config.gitCloneRoot)

export async function getProjectCredentials(
  projectId: string,
): Promise<ProjectCredentials | null> {
  // Prefer data services + project storage
  const dataServices = await db
    .select()
    .from(services)
    .where(eq(services.projectId, projectId))
  const postgres = dataServices.find(
    (s) => s.type === "postgres" && s.credentialsEncrypted && s.status === "running",
  )
  const redis = dataServices.find(
    (s) => s.type === "redis" && s.credentialsEncrypted && s.status === "running",
  )
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))

  let storage: StorageCredentials | null = null
  if (project?.storageCredentialsEncrypted) {
    try {
      storage = JSON.parse(
        decryptString(
          project.storageCredentialsEncrypted,
          config.secretsEncryptionKey,
        ),
      ) as StorageCredentials
    } catch {
      storage = null
    }
  }

  if (postgres?.credentialsEncrypted && redis?.credentialsEncrypted && storage) {
    try {
      return {
        database: JSON.parse(
          decryptString(
            postgres.credentialsEncrypted,
            config.secretsEncryptionKey,
          ),
        ) as DatabaseCredentials,
        redis: JSON.parse(
          decryptString(redis.credentialsEncrypted, config.secretsEncryptionKey),
        ) as RedisCredentials,
        storage,
      }
    } catch {
      // fall through
    }
  }

  const links = await db
    .select()
    .from(resourceLinks)
    .where(eq(resourceLinks.projectId, projectId))
  const assembled = resourceLinkService.assemble(links)
  if (assembled) return assembled

  if (!project?.credentialsEncrypted) return null
  try {
    return JSON.parse(
      decryptString(project.credentialsEncrypted, config.secretsEncryptionKey),
    ) as ProjectCredentials
  } catch {
    return null
  }
}

/**
 * Resolve deploy env from bindings. Returns null when project has no bindings
 * yet (compat path should use getProjectCredentials).
 */
export async function getServiceDeployEnv(
  consumerServiceId: string,
): Promise<BindingEnvInput | null> {
  const bindings = await db
    .select()
    .from(serviceBindings)
    .where(eq(serviceBindings.consumerServiceId, consumerServiceId))
  if (bindings.length === 0) return null

  const resolved: BindingEnvInput["bindings"] = []
  for (const b of bindings) {
    const [provider] = await db
      .select()
      .from(services)
      .where(eq(services.id, b.providerServiceId))
    if (!provider?.credentialsEncrypted) continue
    try {
      const creds = JSON.parse(
        decryptString(
          provider.credentialsEncrypted,
          config.secretsEncryptionKey,
        ),
      ) as DatabaseCredentials | RedisCredentials
      const url =
        provider.type === "postgres"
          ? buildDatabaseUrl(creds as DatabaseCredentials)
          : buildRedisUrl(creds as RedisCredentials)
      resolved.push({ envKey: b.envKey, url })
    } catch {
      // skip bad credential
    }
  }

  const [consumer] = await db
    .select()
    .from(services)
    .where(eq(services.id, consumerServiceId))
  let storage: BindingEnvInput["storage"] = null
  if (consumer) {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, consumer.projectId))
    if (project?.storageCredentialsEncrypted) {
      try {
        storage = JSON.parse(
          decryptString(
            project.storageCredentialsEncrypted,
            config.secretsEncryptionKey,
          ),
        ) as StorageCredentials
      } catch {
        storage = null
      }
    }
  }

  return { bindings: resolved, storage }
}

export async function ensureProjectStorage(
  projectId: string,
  projectSlug: string,
): Promise<StorageCredentials | null> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
  if (!project) return null
  if (project.storageCredentialsEncrypted) {
    try {
      return JSON.parse(
        decryptString(
          project.storageCredentialsEncrypted,
          config.secretsEncryptionKey,
        ),
      ) as StorageCredentials
    } catch {
      // re-provision
    }
  }
  const encrypted = await resourceLinkService.provision("s3", projectSlug, {
    projectId,
    resourceLinkId: `storage-${projectId}`,
  })
  await db
    .update(projects)
    .set({ storageCredentialsEncrypted: encrypted })
    .where(eq(projects.id, projectId))
  return JSON.parse(
    decryptString(encrypted, config.secretsEncryptionKey),
  ) as StorageCredentials
}

export async function enqueueServiceProvision(serviceId: string): Promise<{
  operationId: string
}> {
  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, serviceId))
  if (!service) throw new Error("Service not found")

  const operation = await createOperation({
    projectId: service.projectId,
    serviceId: service.id,
    type: "provision",
    stage: "queued",
  })
  await db
    .update(services)
    .set({
      status: "queued",
      lastOperationId: operation.id,
      errorMessage: null,
    })
    .where(eq(services.id, service.id))
  await markOperationQueued(operation.id)

  const job = { operationId: operation.id, serviceId: service.id }
  if (env.useQueue) {
    try {
      await enqueueProvision(job)
    } catch (error) {
      console.error("[deplow] enqueue provision failed; in-process", error)
      const { processProvisionJob } = await import(
        "@/lib/core/queue/provision-processor"
      )
      void processProvisionJob(job).catch((err) =>
        console.error("[deplow] provision crashed", err),
      )
    }
  } else {
    const { processProvisionJob } = await import(
      "@/lib/core/queue/provision-processor"
    )
    void processProvisionJob(job).catch((err) =>
      console.error("[deplow] provision crashed", err),
    )
  }
  return { operationId: operation.id }
}

/** Backfill default bindings for legacy projects (all apps → all data services). */
export async function ensureBindingsMigrated(projectId: string): Promise<void> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
  if (!project || project.bindingsMigratedAt) return

  const rows = await db
    .select()
    .from(services)
    .where(eq(services.projectId, projectId))
  const consumers = rows.filter((s) => s.type === "web" || s.type === "worker")
  const providers = rows.filter(
    (s) =>
      (s.type === "postgres" || s.type === "redis") && s.credentialsEncrypted,
  )

  for (const consumer of consumers) {
    for (const provider of providers) {
      const envKey = provider.type === "postgres" ? "DATABASE_URL" : "REDIS_URL"
      const existing = await db
        .select()
        .from(serviceBindings)
        .where(
          and(
            eq(serviceBindings.consumerServiceId, consumer.id),
            eq(serviceBindings.envKey, envKey),
          ),
        )
      if (existing.length > 0) continue
      await db.insert(serviceBindings).values({
        id: crypto.randomUUID(),
        projectId,
        consumerServiceId: consumer.id,
        providerServiceId: provider.id,
        envKey,
      })
    }
  }

  await db
    .update(projects)
    .set({ bindingsMigratedAt: new Date() })
    .where(eq(projects.id, projectId))
}

export async function getBackupTargets(
  projectId: string,
): Promise<BackupTarget[]> {
  await ensureProjectStorage(
    projectId,
    (
      await db.select().from(projects).where(eq(projects.id, projectId))
    )[0]?.slug ?? "project",
  ).catch(() => null)

  const dataSvcs = await db
    .select()
    .from(services)
    .where(eq(services.projectId, projectId))
  const targets: BackupTarget[] = []
  for (const svc of dataSvcs) {
    if (svc.type !== "postgres" && svc.type !== "redis") continue
    if (!svc.credentialsEncrypted || svc.status === "error") continue
    const kind = svc.type as ResourceKind
    const driver = resourceLinkService.driver(kind)
    if (!driver.capabilities.backup) continue
    try {
      targets.push({
        resourceLinkId: svc.legacyResourceLinkId ?? "",
        serviceId: svc.id,
        kind,
        credentials: JSON.parse(
          decryptString(svc.credentialsEncrypted, config.secretsEncryptionKey),
        ),
        driver,
      })
    } catch {
      // skip
    }
  }
  if (targets.length > 0) return targets

  const links = await db
    .select()
    .from(resourceLinks)
    .where(eq(resourceLinks.projectId, projectId))
  for (const link of links) {
    if (link.status !== "ready" || !link.credentialsEncrypted) continue
    const kind = link.kind as ResourceKind
    if (kind !== "postgres" && kind !== "redis" && kind !== "s3") continue
    const driver = resourceLinkService.driver(kind)
    if (!driver.capabilities.backup) continue
    targets.push({
      resourceLinkId: link.id,
      kind,
      credentials: resourceLinkService.decrypt(link.credentialsEncrypted),
      driver,
    })
  }
  if (targets.length > 0) return targets

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
  if (!project?.credentialsEncrypted) return []
  try {
    const creds = JSON.parse(
      decryptString(project.credentialsEncrypted, config.secretsEncryptionKey),
    ) as ProjectCredentials
    if (creds.database) {
      targets.push({
        resourceLinkId: "",
        kind: "postgres",
        credentials: creds.database,
        driver: resourceLinkService.driver("postgres"),
      })
    }
    if (creds.redis) {
      targets.push({
        resourceLinkId: "",
        kind: "redis",
        credentials: creds.redis,
        driver: resourceLinkService.driver("redis"),
      })
    }
  } catch {
    return []
  }
  return targets
}

export async function getResourceTarget(
  projectId: string,
  resourceLinkId: string,
): Promise<BackupTarget | null> {
  const [svc] = await db
    .select()
    .from(services)
    .where(
      and(eq(services.projectId, projectId), eq(services.id, resourceLinkId)),
    )
  if (
    svc?.credentialsEncrypted &&
    (svc.type === "postgres" || svc.type === "redis")
  ) {
    const kind = svc.type as ResourceKind
    const driver = resourceLinkService.driver(kind)
    if (!driver.capabilities.backup) return null
    return {
      resourceLinkId: svc.legacyResourceLinkId ?? "",
      serviceId: svc.id,
      kind,
      credentials: JSON.parse(
        decryptString(svc.credentialsEncrypted, config.secretsEncryptionKey),
      ),
      driver,
    }
  }

  const [link] = await db
    .select()
    .from(resourceLinks)
    .where(
      and(
        eq(resourceLinks.projectId, projectId),
        eq(resourceLinks.id, resourceLinkId),
      ),
    )
  if (!link?.credentialsEncrypted) return null
  const kind = link.kind as ResourceKind
  if (kind !== "postgres" && kind !== "redis" && kind !== "s3") return null
  return {
    resourceLinkId: link.id,
    kind,
    credentials: resourceLinkService.decrypt(link.credentialsEncrypted),
    driver: resourceLinkService.driver(kind),
  }
}

export async function getPostgresCredentials(
  projectId: string,
  serviceId?: string,
): Promise<{ linkId: string; serviceId: string; credentials: DatabaseCredentials } | null> {
  if (serviceId) {
    const [svc] = await db
      .select()
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.projectId, projectId)))
    if (svc?.credentialsEncrypted && svc.type === "postgres") {
      return {
        linkId: svc.legacyResourceLinkId ?? svc.id,
        serviceId: svc.id,
        credentials: JSON.parse(
          decryptString(svc.credentialsEncrypted, config.secretsEncryptionKey),
        ) as DatabaseCredentials,
      }
    }
  }

  const [svc] = await db
    .select()
    .from(services)
    .where(
      and(eq(services.projectId, projectId), eq(services.type, "postgres")),
    )
  if (svc?.credentialsEncrypted && svc.status !== "error") {
    try {
      return {
        linkId: svc.legacyResourceLinkId ?? svc.id,
        serviceId: svc.id,
        credentials: JSON.parse(
          decryptString(svc.credentialsEncrypted, config.secretsEncryptionKey),
        ) as DatabaseCredentials,
      }
    } catch {
      // fall through
    }
  }

  const [link] = await db
    .select()
    .from(resourceLinks)
    .where(
      and(
        eq(resourceLinks.projectId, projectId),
        eq(resourceLinks.kind, "postgres"),
      ),
    )
  if (link?.credentialsEncrypted && link.status === "ready") {
    return {
      linkId: link.id,
      serviceId: svc?.id ?? "",
      credentials: resourceLinkService.decrypt(
        link.credentialsEncrypted,
      ) as DatabaseCredentials,
    }
  }
  const creds = await getProjectCredentials(projectId)
  if (!creds?.database) return null
  return { linkId: link?.id ?? "", serviceId: svc?.id ?? "", credentials: creds.database }
}

export async function getRedisCredentials(
  projectId: string,
  serviceId?: string,
): Promise<{ linkId: string; serviceId: string; credentials: RedisCredentials } | null> {
  if (serviceId) {
    const [svc] = await db
      .select()
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.projectId, projectId)))
    if (svc?.credentialsEncrypted && svc.type === "redis") {
      return {
        linkId: svc.legacyResourceLinkId ?? svc.id,
        serviceId: svc.id,
        credentials: JSON.parse(
          decryptString(svc.credentialsEncrypted, config.secretsEncryptionKey),
        ) as RedisCredentials,
      }
    }
  }

  const [svc] = await db
    .select()
    .from(services)
    .where(and(eq(services.projectId, projectId), eq(services.type, "redis")))
  if (svc?.credentialsEncrypted && svc.status !== "error") {
    try {
      return {
        linkId: svc.legacyResourceLinkId ?? svc.id,
        serviceId: svc.id,
        credentials: JSON.parse(
          decryptString(svc.credentialsEncrypted, config.secretsEncryptionKey),
        ) as RedisCredentials,
      }
    } catch {
      // fall through
    }
  }

  const [link] = await db
    .select()
    .from(resourceLinks)
    .where(
      and(
        eq(resourceLinks.projectId, projectId),
        eq(resourceLinks.kind, "redis"),
      ),
    )
  if (link?.credentialsEncrypted && link.status === "ready") {
    return {
      linkId: link.id,
      serviceId: svc?.id ?? "",
      credentials: resourceLinkService.decrypt(
        link.credentialsEncrypted,
      ) as RedisCredentials,
    }
  }
  const creds = await getProjectCredentials(projectId)
  if (!creds?.redis) return null
  return { linkId: link?.id ?? "", serviceId: svc?.id ?? "", credentials: creds.redis }
}

export function scheduleProjectBackups(
  projectId: string,
  intervalMs: number,
): void {
  backupScheduler.schedule({
    projectId,
    intervalMs: BackupScheduler.normalizeIntervalMs(intervalMs),
    getTargets: async () => getBackupTargets(projectId),
  })
}

export async function ensureLocalNodeId(): Promise<string> {
  const [existing] = await db
    .select()
    .from(nodes)
    .where(eq(nodes.name, "local"))
  if (existing) return existing.id

  const id = crypto.randomUUID()
  const probe = await dockerNodeExecutor.getStatus(id)
  await db.insert(nodes).values({
    id,
    name: "local",
    provider: "docker",
    host: "local",
    port: 22,
    status: probe.online ? "online" : "offline",
    lastSeenAt: probe.online ? new Date() : null,
  })
  return id
}

export async function resumeBackupSchedules(): Promise<number> {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.status, "ready"))
  const daily = BackupScheduler.defaultIntervalMs()

  for (const row of rows) {
    const interval = BackupScheduler.normalizeIntervalMs(
      row.backupIntervalMs ?? daily,
    )
    if (interval !== row.backupIntervalMs) {
      await db
        .update(projects)
        .set({ backupIntervalMs: interval })
        .where(eq(projects.id, row.id))
    }
    scheduleProjectBackups(row.id, interval)
    void backupService.prune(row.id).catch((err) => {
      console.error(`Failed to prune backups for ${row.id}`, err)
    })
  }
  return rows.length
}

if (typeof process !== "undefined" && process.env.VITEST !== "true") {
  void resumeBackupSchedules().catch((err) => {
    console.error("Failed to resume backup schedules", err)
  })
  void reclaimStaleOperations()
    .then((n) => {
      if (n > 0) console.info(`[deplow] reclaimed ${n} stale operations`)
    })
    .catch((err) => console.error("Failed to reclaim stale operations", err))

  const globalForQueue = globalThis as typeof globalThis & {
    __deplowQueueStarted?: boolean
  }
  if (!globalForQueue.__deplowQueueStarted && env.useQueue) {
    globalForQueue.__deplowQueueStarted = true
    startQueueWorkers({
      deploy: async (job) => {
        const { processDeployJob } = await import(
          "@/lib/core/queue/deploy-processor"
        )
        return processDeployJob(job.data)
      },
      provision: async (job) => {
        const { processProvisionJob } = await import(
          "@/lib/core/queue/provision-processor"
        )
        return processProvisionJob(job.data)
      },
    })
  }
}

export {
  db,
  projects,
  services,
  resourceLinks,
  serviceBindings,
  operations,
  nodes,
  deployments,
  backups,
  eq,
  and,
  desc,
}
