import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq"

import { env } from "@/lib/env"

export const QUEUE_NAMES = {
  deploy: "deplow-deploy",
  provision: "deplow-provision",
  backup: "deplow-backup",
  restore: "deplow-restore",
  destroy: "deplow-destroy",
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

type ProcessorMap = {
  deploy?: (job: Job<DeployJobData>) => Promise<void>
  provision?: (job: Job<ProvisionJobData>) => Promise<void>
  backup?: (job: Job<BackupJobData>) => Promise<void>
  restore?: (job: Job<RestoreJobData>) => Promise<void>
  destroy?: (job: Job<DestroyJobData>) => Promise<void>
}

const workers: Worker[] = []

export function startQueueWorkers(processors: ProcessorMap): void {
  if (!env.useQueue) return

  if (processors.deploy) {
    workers.push(
      new Worker(QUEUE_NAMES.deploy, processors.deploy, {
        connection: getQueueConnection(),
        concurrency: 2,
      }),
    )
  }
  if (processors.provision) {
    workers.push(
      new Worker(QUEUE_NAMES.provision, processors.provision, {
        connection: getQueueConnection(),
        concurrency: 2,
      }),
    )
  }
  if (processors.backup) {
    workers.push(
      new Worker(QUEUE_NAMES.backup, processors.backup, {
        connection: getQueueConnection(),
        concurrency: 1,
      }),
    )
  }
  if (processors.restore) {
    workers.push(
      new Worker(QUEUE_NAMES.restore, processors.restore, {
        connection: getQueueConnection(),
        concurrency: 1,
      }),
    )
  }
  if (processors.destroy) {
    workers.push(
      new Worker(QUEUE_NAMES.destroy, processors.destroy, {
        connection: getQueueConnection(),
        concurrency: 1,
      }),
    )
  }

  for (const w of workers) {
    w.on("failed", (job, err) => {
      console.error(
        `[deplow] queue job failed ${job?.queueName}/${job?.id}`,
        err,
      )
    })
  }
}

export async function closeQueueWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()))
  workers.length = 0
  await Promise.all([...queues.values()].map((q) => q.close()))
  queues.clear()
}
