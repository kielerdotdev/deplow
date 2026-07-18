import { spawn } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { S3Client } from "@aws-sdk/client-s3"

import type { StorageCredentials } from "@hostrig/shared"

import { randomPassword, sanitizeIdentifier } from "../../crypto"
import {
  createS3Client,
  deleteBucketQuiet,
  deleteObject,
  emptyBucket,
  ensureBucket,
  getObject,
  projectBucketName,
  putObject,
} from "./ops"
import type { S3Adapter, S3AdapterConfig } from "./types"

/**
 * MinIO S3 adapter — creates buckets on demand.
 * Optionally provisions per-bucket IAM users via `mc admin` when scopedUsers is on.
 */
export class MinioS3Adapter implements S3Adapter {
  readonly provider = "minio" as const
  private readonly client: S3Client

  constructor(private readonly config: S3AdapterConfig) {
    this.client = createS3Client(config, { forcePathStyle: true })
  }

  async ensureBackupBucket(): Promise<void> {
    await ensureBucket(this.client, this.config.backupBucket)
  }

  async createBucket(projectSlug: string): Promise<StorageCredentials> {
    const bucket = projectBucketName(projectSlug)
    await ensureBucket(this.client, bucket)

    if (this.config.scopedUsers) {
      const pair = this.generateAccessPair(projectSlug)
      assertNotPlatformKeys(pair, this.config)
      await this.provisionMinioUser(
        pair.accessKeyId,
        pair.secretAccessKey,
        bucket,
      )
      return {
        endpoint: this.config.publicEndpoint,
        bucket,
        accessKeyId: pair.accessKeyId,
        secretAccessKey: pair.secretAccessKey,
        region: this.config.region,
      }
    }

    return {
      endpoint: this.config.publicEndpoint,
      bucket,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: this.config.region,
    }
  }

  async destroyBucket(bucket: string, accessKeyId?: string): Promise<void> {
    await emptyBucket(this.client, bucket)
    await deleteBucketQuiet(this.client, bucket)
    if (this.config.scopedUsers) {
      await this.cleanupMinioUser(accessKeyId, bucket)
    }
  }

  putObject(
    bucket: string,
    key: string,
    body: Buffer,
    contentType?: string,
  ): Promise<void> {
    return putObject(this.client, bucket, key, body, contentType)
  }

  getObject(bucket: string, key: string): Promise<Buffer> {
    return getObject(this.client, bucket, key)
  }

  deleteObject(bucket: string, key: string): Promise<void> {
    return deleteObject(this.client, bucket, key)
  }

  /** App-facing endpoint (may differ from publicEndpoint on a Docker network). */
  appEndpoint(): string {
    return this.config.appEndpoint
  }

  private generateAccessPair(projectSlug: string): {
    accessKeyId: string
    secretAccessKey: string
  } {
    const base = sanitizeIdentifier(projectSlug).replace(/_/g, "").slice(0, 10)
    const suffix = randomPassword(6).replace(/[^a-zA-Z0-9]/g, "x")
    return {
      accessKeyId: `prj${base}${suffix}`.slice(0, 20),
      secretAccessKey: randomPassword(40),
    }
  }

  private async cleanupMinioUser(
    accessKeyId?: string,
    bucket?: string,
  ): Promise<void> {
    if (!accessKeyId || accessKeyId === this.config.accessKeyId) return
    if (!bucket) return

    const policyName = `pol-${bucket}`.slice(0, 32)
    const adminEndpoint = this.config.appEndpoint
    await this.runMcScript(`
      mc alias set local ${adminEndpoint} ${this.config.accessKeyId} ${this.config.secretAccessKey}
      mc admin policy detach local ${policyName} --user ${accessKeyId} || true
      mc admin user remove local ${accessKeyId} || true
      mc admin policy remove local ${policyName} || true
    `).catch(() => undefined)
  }

  private async provisionMinioUser(
    accessKey: string,
    secretKey: string,
    bucket: string,
  ): Promise<void> {
    const policyName = `pol-${bucket}`.slice(0, 32)
    const dir = mkdtempSync(path.join(tmpdir(), "hostrig-minio-"))
    const policyPath = path.join(dir, "policy.json")
    writeFileSync(policyPath, JSON.stringify(buildBucketPolicy(bucket)))
    const adminEndpoint = this.config.appEndpoint

    try {
      await this.runMcScript(
        `
        mc alias set local ${adminEndpoint} ${this.config.accessKeyId} ${this.config.secretAccessKey}
        mc admin user remove local ${accessKey} || true
        mc admin user add local ${accessKey} ${secretKey}
        mc admin policy remove local ${policyName} || true
        mc admin policy create local ${policyName} /policy.json
        mc admin policy attach local ${policyName} --user ${accessKey}
        `,
        { policyPath },
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  private runMcScript(
    script: string,
    opts?: { policyPath?: string },
  ): Promise<void> {
    const network = this.config.dockerNetwork ?? "hostrig_default"
    const dockerArgs = [
      "run",
      "--rm",
      "--entrypoint",
      "sh",
      "--network",
      network,
    ]
    if (opts?.policyPath) {
      dockerArgs.push("-v", `${opts.policyPath}:/policy.json:ro`)
    }
    dockerArgs.push("minio/mc:latest", "-c", script)

    return new Promise((resolve, reject) => {
      const child = spawn("docker", dockerArgs, { env: process.env })
      let stderr = ""
      let stdout = ""
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")))
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")))
      child.on("error", reject)
      child.on("close", (code) => {
        if (code === 0) return resolve()
        reject(
          new Error(`mc failed (${code}): ${stderr || stdout || "unknown"}`),
        )
      })
    })
  }
}

function buildBucketPolicy(bucket: string) {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["s3:*"],
        Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`],
      },
    ],
  }
}

function assertNotPlatformKeys(
  pair: { accessKeyId: string; secretAccessKey: string },
  config: S3AdapterConfig,
): void {
  if (
    pair.accessKeyId === config.accessKeyId ||
    pair.secretAccessKey === config.secretAccessKey
  ) {
    throw new Error(
      "Refusing to issue platform root MinIO credentials to a project",
    )
  }
}
