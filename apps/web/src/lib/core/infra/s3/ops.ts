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

import { sanitizeIdentifier } from "../../crypto"
import type { S3AdapterConfig } from "./types"

export function createS3Client(
  config: S3AdapterConfig,
  opts?: { forcePathStyle?: boolean },
): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: opts?.forcePathStyle ?? config.provider === "minio",
  })
}

export function projectBucketName(projectSlug: string): string {
  return sanitizeIdentifier(`prj-${projectSlug}`).replace(/_/g, "-")
}

export function isAlreadyExists(error: unknown): boolean {
  const name = (error as { name?: string }).name ?? ""
  const msg = String(error).toLowerCase()
  return (
    /BucketAlready/i.test(name) ||
    msg.includes("already") ||
    msg.includes("conflict")
  )
}

export async function ensureBucket(
  client: S3Client,
  bucket: string,
): Promise<void> {
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
  } catch (error) {
    if (!isAlreadyExists(error)) throw error
  }
}

export async function emptyBucket(
  client: S3Client,
  bucket: string,
): Promise<void> {
  let continuation: string | undefined
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuation,
      }),
    )
    const objects = (listed.Contents ?? [])
      .map((o) => (o.Key ? { Key: o.Key } : null))
      .filter(Boolean) as { Key: string }[]
    if (objects.length > 0) {
      await client.send(
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

export async function deleteBucketQuiet(
  client: S3Client,
  bucket: string,
): Promise<void> {
  try {
    await client.send(new DeleteBucketCommand({ Bucket: bucket }))
  } catch {
    // bucket may already be gone
  }
}

export async function putObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType = "application/octet-stream",
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function getObject(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer> {
  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  )
  const bytes = await res.Body?.transformToByteArray()
  if (!bytes) throw new Error(`Empty object s3://${bucket}/${key}`)
  return Buffer.from(bytes)
}

export async function deleteObject(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<void> {
  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key }),
  )
}
