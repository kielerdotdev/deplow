import Redis from "ioredis"

import type { RedisCredentials } from "@deplow/shared"

import { randomPassword, sanitizeIdentifier } from "../crypto"
import type { PlatformConfig } from "../platform-config"

/**
 * Per-project Redis ACL commands — restricted to key-space commands only.
 * Never grant +@all to per-project users.
 */
const ACL_GRANTS = [
  "-@all",
  "+@read",
  "+@write",
  "+@keyspace",
  "+@string",
  "+@hash",
  "+@list",
  "+@set",
  "+@sortedset",
  "+@stream",
  "+ping",
  "+info",
  "+select",
  "+ttl",
  "+expire",
  "+type",
  "+exists",
  "+del",
  "+scan",
]

export class RedisProvisioner {
  constructor(private readonly config: PlatformConfig) {}

  async createNamespace(projectSlug: string): Promise<RedisCredentials> {
    const username = sanitizeIdentifier(`u_${projectSlug}`)
    const namespace = sanitizeIdentifier(projectSlug)
    const password = randomPassword(28)

    const redis = this.client()
    await redis.connect()
    try {
      await safeDelUser(redis, username)
      await redis.call(
        "ACL",
        "SETUSER",
        username,
        "on",
        `>${password}`,
        `~${namespace}:*`,
        "&*",
        ...ACL_GRANTS,
      )
    } finally {
      redis.disconnect()
    }

    return {
      host: this.config.redisHost,
      port: this.config.redisPort,
      password,
      namespace,
      url: `redis://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${this.config.redisHost}:${this.config.redisPort}`,
    }
  }

  async destroyNamespace(projectSlug: string): Promise<void> {
    const username = sanitizeIdentifier(`u_${projectSlug}`)
    const namespace = sanitizeIdentifier(projectSlug)

    const redis = this.client()
    await redis.connect()
    try {
      await deleteNamespacedKeys(redis, namespace)
      await safeDelUser(redis, username)
    } finally {
      redis.disconnect()
    }
  }

  private client(): Redis {
    return new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
  }
}

async function safeDelUser(redis: Redis, username: string): Promise<void> {
  try {
    await redis.call("ACL", "DELUSER", username)
  } catch {
    // user may not exist yet — safe to ignore
  }
}

async function deleteNamespacedKeys(
  redis: Redis,
  namespace: string,
): Promise<void> {
  let cursor = "0"
  do {
    const [next, keys] = (await redis.scan(
      cursor,
      "MATCH",
      `${namespace}:*`,
      "COUNT",
      200,
    )) as [string, string[]]
    cursor = next
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } while (cursor !== "0")
}