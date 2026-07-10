import Redis from "ioredis"

import type { RedisCredentials } from "@deplow/shared"

import { randomPassword, sanitizeIdentifier } from "../crypto"
import type { PlatformConfig } from "../platform-config"

export class RedisProvisioner {
  constructor(private readonly config: PlatformConfig) {}

  private client(): Redis {
    return new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
  }

  async createNamespace(projectSlug: string): Promise<RedisCredentials> {
    const username = sanitizeIdentifier(`u_${projectSlug}`)
    const namespace = sanitizeIdentifier(projectSlug)
    const password = randomPassword(28)
    const redis = this.client()
    await redis.connect()
    try {
      // Redis ACL: user can only touch keys under namespace:*
      // ACL SETUSER name on >pass ~ns:* &* -@all +@read +@write +@keyspace +@string +@hash +@list +@set +@sortedset +@stream +ping +info +select
      try {
        await redis.call("ACL", "DELUSER", username)
      } catch {
        // ignore
      }
      await redis.call(
        "ACL",
        "SETUSER",
        username,
        "on",
        `>${password}`,
        `~${namespace}:*`,
        "&*",
        "+@all",
      )
      // ACL SAVE may fail when users.acl is mounted read-only — runtime ACL is enough
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
      // Delete namespaced keys via SCAN
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

      await redis.call("ACL", "DELUSER", username).catch(() => undefined)
    } finally {
      redis.disconnect()
    }
  }
}
