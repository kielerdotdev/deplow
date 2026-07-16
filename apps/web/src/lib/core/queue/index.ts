import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq"

import { env } from "@/lib/env"

export const QUEUE_NAMES = {
  deploy: "deplow-deploy",
  provision: "deplow-provision",
  backup: "deplow-backup",
  restore: "deplow-restore",
  destroy: "deplow-destroy",
  observeDigest: "deplow-observe-digest",
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

export type DeployJobData = {
  operationId: string
  deploymentId: string
  serviceId: string
  fromGit?: boolean
  image?: string
  sourcePath?: string
  triggeredBy?: string
  options?: Record<string, unknown>
}

export type ProvisionJobData = {
  operationId: string
  serviceId: string
}

export type BackupJobData = {
  operationId: string
  projectId: string
  serviceId?: string
  force?: boolean
}

export type RestoreJobData = {
  operationId: string
  projectId: string
  serviceId: string
  backupId?: string
  targetAt?: string
  kind: "snapshot" | "pitr"
}

export type DestroyJobData = {
  operationId: string
  serviceId: string
}

export type ObserveDigestJobData = {
  sentryId: number
  eventId: string
  stagingPath: string
  receivedAt: string
}

let connection: ConnectionOptions | null = null

export function getQueueConnection(): ConnectionOptions {
  if (!connection) {
    connection = { url: env.queueRedisUrl, maxRetriesPerRequest: null }
  }
  return connection
}

const queues = new Map<string, Queue>()

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name)
  if (!q) {
    q = new Queue(name, { connection: getQueueConnection() })
    queues.set(name, q)
  }
  return q
}

export async function enqueueDeploy(data: DeployJobData): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.deploy)
  await queue.add("deploy", data, {
    jobId: `deploy:${data.serviceId}:${data.deploymentId}`,
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 1,
  })
}

export async function enqueueProvision(data: ProvisionJobData): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.provision)
  await queue.add("provision", data, {
    jobId: `provision:${data.serviceId}:${data.operationId}`,
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 1,
  })
}

export async function enqueueBackup(data: BackupJobData): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.backup)
  await queue.add("backup", data, {
    jobId: `backup:${data.operationId}`,
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 1,
  })
}

export async function enqueueRestore(data: RestoreJobData): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.restore)
  await queue.add("restore", data, {
    jobId: `restore:${data.operationId}`,
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 1,
  })
}

export async function enqueueDestroy(data: DestroyJobData): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.destroy)
  await queue.add("destroy", data, {
    jobId: `destroy:${data.serviceId}:${data.operationId}`,
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 1,
  })
}

export async function enqueueObserveDigest(
  data: ObserveDigestJobData,
): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.observeDigest)
  await queue.add("observe-digest", data, {
    jobId: `observe-digest:${data.sentryId}:${data.eventId}`,
    removeOnComplete: 200,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
  })
}

type ProcessorMap = {
  deploy?: (job: Job<DeployJobData>) => Promise<void>
  provision?: (job: Job<ProvisionJobData>) => Promise<void>
  backup?: (job: Job<BackupJobData>) => Promise<void>
  restore?: (job: Job<RestoreJobData>) => Promise<void>
  destroy?: (job: Job<DestroyJobData>) => Promise<void>
  observeDigest?: (job: Job<ObserveDigestJobData>) => Promise<void>
}

const workers: Worker[] = []

/** Railpack/Docker builds often exceed BullMQ's 30s default lock. */
const LONG_JOB_LOCK_MS = 30 * 60 * 1000

export function startQueueWorkers(processors: ProcessorMap): void {
  if (!env.useQueue) return

  if (processors.deploy) {
    workers.push(
      new Worker(QUEUE_NAMES.deploy, processors.deploy, {
        connection: getQueueConnection(),
        concurrency: 2,
        lockDuration: LONG_JOB_LOCK_MS,
        stalledInterval: 60_000,
      }),
    )
  }
  if (processors.provision) {
    workers.push(
      new Worker(QUEUE_NAMES.provision, processors.provision, {
        connection: getQueueConnection(),
        concurrency: 2,
        lockDuration: LONG_JOB_LOCK_MS,
        stalledInterval: 60_000,
      }),
    )
  }
  if (processors.backup) {
    workers.push(
      new Worker(QUEUE_NAMES.backup, processors.backup, {
        connection: getQueueConnection(),
        concurrency: 1,
        lockDuration: LONG_JOB_LOCK_MS,
        stalledInterval: 60_000,
      }),
    )
  }
  if (processors.restore) {
    workers.push(
      new Worker(QUEUE_NAMES.restore, processors.restore, {
        connection: getQueueConnection(),
        concurrency: 1,
        lockDuration: LONG_JOB_LOCK_MS,
        stalledInterval: 60_000,
      }),
    )
  }
  if (processors.destroy) {
    workers.push(
      new Worker(QUEUE_NAMES.destroy, processors.destroy, {
        connection: getQueueConnection(),
        concurrency: 1,
        lockDuration: 5 * 60 * 1000,
        stalledInterval: 60_000,
      }),
    )
  }
  if (processors.observeDigest) {
    workers.push(
      new Worker(QUEUE_NAMES.observeDigest, processors.observeDigest, {
        connection: getQueueConnection(),
        concurrency: 4,
        lockDuration: 60_000,
        stalledInterval: 30_000,
      }),
    )
  }

  for (const w of workers) {
    w.on("failed", (job, err) => {
      console.error(
        `[deplow] queue job failed ${job?.queueName}/${job?.id}`,
        err,
      )
      // Stall/crash failures bypass the processor catch — sync DB so UI leaves "checking".
      if (job?.queueName === QUEUE_NAMES.deploy && job.data) {
        void import("@/lib/core/queue/deploy-processor")
          .then(({ failDeployAfterQueueLoss }) =>
            failDeployAfterQueueLoss(
              job.data,
              err instanceof Error ? err : new Error(String(err)),
            ),
          )
          .catch((e) =>
            console.error("[deplow] failDeployAfterQueueLoss failed", e),
          )
      }
    })
  }
}

export async function closeQueueWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()))
  workers.length = 0
  await Promise.all([...queues.values()].map((q) => q.close()))
  queues.clear()
}
