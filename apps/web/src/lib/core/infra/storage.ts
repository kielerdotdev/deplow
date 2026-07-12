import { spawn } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

import type { StorageCredentials } from "@deplow/shared"

import { randomPassword, sanitizeIdentifier } from "../crypto"
import type { PlatformConfig } from "../platform-config"

export class StorageProvisioner {
  private readonly client: S3Client

  constructor(private readonly config: PlatformConfig) {
    this.client = new S3Client({
      endpoint: config.minioEndpoint,
      region: config.minioRegion,
      credentials: {
        accessKeyId: config.minioAccessKey,
        secretAccessKey: config.minioSecretKey,
      },
      forcePathStyle: true,
    })
  }

  async ensureBackupBucket(): Promise<void> {
    try {
      await this.client.send(
        new CreateBucketCommand({ Bucket: this.config.backupBucket }),
      )
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
    }
  }

  async createBucket(projectSlug: string): Promise<StorageCredentials> {
    const bucket = sanitizeIdentifier(`prj-${projectSlug}`).replace(/_/g, "-")
    await this.ensureBucketExists(bucket)

    const pair = this.generateAccessPair(projectSlug)
    assertNotPlatformKeys(pair, this.config)

    await this.provisionMinioUser(
      pair.accessKeyId,
      pair.secretAccessKey,
      bucket,
    )

    return {
      endpoint: this.config.minioPublicEndpoint,
      bucket,
      accessKeyId: pair.accessKeyId,
      secretAccessKey: pair.secretAccessKey,
      region: this.config.minioRegion,
    }
  }

  async destroyBucket(bucket: string, accessKeyId?: string): Promise<void> {
    await this.emptyBucket(bucket)
    await this.deleteBucketQuiet(bucket)
    await this.cleanupMinioUser(accessKeyId, bucket)
  }

  async putObject(
    bucket: string,
    key: string,
    body: Buffer,
    contentType = "application/octet-stream",
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    )
  }

  async getObject(bucket: string, key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    )
    const bytes = await res.Body?.transformToByteArray()
    if (!bytes) throw new Error(`Empty object s3://${bucket}/${key}`)
    return Buffer.from(bytes)
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    )
  }

  generateAccessPair(projectSlug: string): {
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

  // ── internal helpers ──────────────────────────────────────────

  private async ensureBucketExists(bucket: string): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }))
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
    }
  }

  private async emptyBucket(bucket: string): Promise<void> {
    let continuation: string | undefined
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuation,
        }),
      )
      const objects = (listed.Contents ?? [])
        .map((o) => (o.Key ? { Key: o.Key } : null))
        .filter(Boolean) as { Key: string }[]
      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects },
          }),
        )
      }
      continuation = listed.IsTruncated
        ? listed.NextContinuationToken
        : undefined
    } while (continuation)
  }

  private async deleteBucketQuiet(bucket: string): Promise<void> {
    try {
      await this.client.send(new DeleteBucketCommand({ Bucket: bucket }))
    } catch {
      // bucket may already be gone
    }
  }

  private async cleanupMinioUser(
    accessKeyId?: string,
    bucket?: string,
  ): Promise<void> {
    if (!accessKeyId || accessKeyId === this.config.minioAccessKey) return
    if (!bucket) return

    const policyName = `pol-${bucket}`.slice(0, 32)
    await this.runMcScript(`
      mc alias set local ${this.config.minioDockerEndpoint} ${this.config.minioAccessKey} ${this.config.minioSecretKey}
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
    const dir = mkdtempSync(path.join(tmpdir(), "deplow-minio-"))
    const policyPath = path.join(dir, "policy.json")
    const policy = buildBucketPolicy(bucket)
    writeFileSync(policyPath, JSON.stringify(policy))

    try {
      await this.runMcScript(
        `
        mc alias set local ${this.config.minioDockerEndpoint} ${this.config.minioAccessKey} ${this.config.minioSecretKey}
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
    const dockerArgs = [
      "run",
      "--rm",
      "--entrypoint",
      "sh",
      "--network",
      this.config.dockerNetwork,
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

// ── module-level helpers ─────────────────────────────────────────

function isAlreadyExists(error: unknown): boolean {
  const name = (error as { name?: string }).name ?? ""
  const msg = String(error).toLowerCase()
  return (
    /BucketAlready/i.test(name) ||
    msg.includes("already") ||
    msg.includes("conflict")
  )
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
  config: PlatformConfig,
): void {
  if (
    pair.accessKeyId === config.minioAccessKey ||
    pair.secretAccessKey === config.minioSecretKey
  ) {
    throw new Error(
      "Refusing to issue platform root MinIO credentials to a project",
    )
  }
}
