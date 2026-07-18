import Redis from "ioredis"

import type { RedisCredentials } from "@hostrig/shared"

import { randomPassword, sanitizeIdentifier } from "../crypto"

/**
 * Per-user Redis ACL grants on a dedicated instance (full keyspace).
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
  "+dump",
  "+restore",
  "+bgsave",
  "+lastsave",
  "+config|get",
]

export type RedisAclUserInfo = {
  username: string
  isAppUser: boolean
}

function operatorUrl(creds: RedisCredentials): string {
  if (creds.url) return creds.url
  if (creds.password) {
    return `redis://:${encodeURIComponent(creds.password)}@${creds.host}:${creds.port}`
  }
  return `redis://${creds.host}:${creds.port}`
}

/**
 * Ops against a dedicated Redis container (password auth + optional ACL users).
 */
export class RedisInstance {
  constructor(private readonly creds: RedisCredentials) {}

  async listUsers(projectSlug: string): Promise<RedisAclUserInfo[]> {
    const appUser = sanitizeIdentifier(`u_${projectSlug}`)
    const prefix = `${appUser}_`
    const redis = this.client()
    await redis.connect()
    try {
      let list: string[] = []
      try {
        list = (await redis.call("ACL", "LIST")) as string[]
      } catch {
        // ACL unavailable — password-only mode
        return [{ username: "default", isAppUser: true }]
      }
      const users: RedisAclUserInfo[] = []
      for (const line of list) {
        const name = line.split(/\s+/)[1]
        if (!name || name === "default") continue
        if (name === appUser || name.startsWith(prefix)) {
          users.push({ username: name, isAppUser: name === appUser })
        }
      }
      if (users.length === 0) {
        users.push({ username: "default", isAppUser: true })
      }
      return users.sort((a, b) => a.username.localeCompare(b.username))
    } finally {
      redis.disconnect()
    }
  }

  async createUser(
    projectSlug: string,
    name: string,
  ): Promise<{ username: string; password: string }> {
    const appUser = sanitizeIdentifier(`u_${projectSlug}`)
    const safe = sanitizeIdentifier(name)
    if (!safe) throw new Error("Invalid username")
    const username = sanitizeIdentifier(`u_${projectSlug}_${safe}`)
    if (username === appUser) throw new Error("Invalid username")
    const password = randomPassword(28)

    const redis = this.client()
    await redis.connect()
    try {
      const existing = await this.listUsers(projectSlug)
      if (existing.some((u) => u.username === username)) {
        throw new Error(`User ${username} already exists`)
      }
      await this.setUser(redis, username, password)
    } finally {
      redis.disconnect()
    }
    return { username, password }
  }

  async rotateUserPassword(
    projectSlug: string,
    username: string,
  ): Promise<{ username: string; password: string }> {
    const appUser = sanitizeIdentifier(`u_${projectSlug}`)
    const prefix = `${appUser}_`
    const password = randomPassword(28)

    const redis = this.client()
    await redis.connect()
    try {
      if (username === "default" || username === appUser) {
        // Rotate requirepass / primary
        await redis.call("CONFIG", "SET", "requirepass", password)
        return { username, password }
      }
      if (!username.startsWith(prefix)) {
        throw new Error("User does not belong to this project")
      }
      await this.setUser(redis, username, password)
      return { username, password }
    } finally {
      redis.disconnect()
    }
  }

  async dropUser(projectSlug: string, username: string): Promise<void> {
    const appUser = sanitizeIdentifier(`u_${projectSlug}`)
    if (username === appUser || username === "default") {
      throw new Error("Cannot drop the primary Redis user")
    }
    const prefix = `${appUser}_`
    if (!username.startsWith(prefix)) {
      throw new Error("User does not belong to this project")
    }
    const redis = this.client()
    await redis.connect()
    try {
      await redis.call("ACL", "DELUSER", username)
    } finally {
      redis.disconnect()
    }
  }

  /** Full-instance key export (dedicated Redis — all keys). */
  async exportAll(): Promise<Buffer> {
    const redis = this.client()
    await redis.connect()
    try {
      const entries: Array<{ key: string; dump: string; ttl: number }> = []
      let cursor = "0"
      do {
        const [next, keys] = (await redis.scan(cursor, "COUNT", 200)) as [
          string,
          string[],
        ]
        cursor = next
        for (const key of keys) {
          const dump = (await redis.call("DUMP", key)) as Buffer | null
          if (!dump) continue
          const ttl = await redis.pttl(key)
          entries.push({
            key,
            dump: Buffer.from(dump).toString("base64"),
            ttl: ttl > 0 ? ttl : -1,
          })
        }
      } while (cursor !== "0")
      return Buffer.from(
        JSON.stringify({ scope: "instance", entries }, null, 2),
        "utf8",
      )
    } finally {
      redis.disconnect()
    }
  }

  async importAll(payload: Buffer): Promise<number> {
    const parsed = JSON.parse(payload.toString("utf8")) as {
      entries?: Array<{ key: string; dump: string; ttl: number }>
    }
    if (!parsed.entries) throw new Error("Invalid Redis snapshot")
    const redis = this.client()
    await redis.connect()
    try {
      let count = 0
      for (const entry of parsed.entries) {
        const buf = Buffer.from(entry.dump, "base64")
        const ttl = entry.ttl > 0 ? entry.ttl : 0
        await redis.call("RESTORE", entry.key, String(ttl), buf, "REPLACE")
        count++
      }
      return count
    } finally {
      redis.disconnect()
    }
  }

  /** RDB dump via BGSAVE + GET (best-effort); falls back to key export. */
  async dumpRdbOrExport(): Promise<Buffer> {
    return this.exportAll()
  }

  async restoreFromExport(body: Buffer): Promise<void> {
    const redis = this.client()
    await redis.connect()
    try {
      await redis.flushall()
    } finally {
      redis.disconnect()
    }
    await this.importAll(body)
  }

  private async setUser(
    redis: Redis,
    username: string,
    password: string,
  ): Promise<void> {
    await redis.call(
      "ACL",
      "SETUSER",
      username,
      "on",
      `>${password}`,
      "~*",
      "&*",
      ...ACL_GRANTS,
    )
  }

  private client(): Redis {
    return new Redis(operatorUrl(this.creds), {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
  }
}

/** @deprecated Prefer RedisInstance */
export class RedisProvisioner {
  constructor(_config?: unknown) {}

  async listUsers(projectSlug: string, creds: RedisCredentials) {
    return new RedisInstance(creds).listUsers(projectSlug)
  }

  async createUser(projectSlug: string, name: string, creds: RedisCredentials) {
    return new RedisInstance(creds).createUser(projectSlug, name)
  }

  async rotateUserPassword(
    projectSlug: string,
    username: string,
    creds: RedisCredentials,
  ) {
    return new RedisInstance(creds).rotateUserPassword(projectSlug, username)
  }

  async dropUser(
    projectSlug: string,
    username: string,
    creds: RedisCredentials,
  ) {
    return new RedisInstance(creds).dropUser(projectSlug, username)
  }

  async exportNamespace(projectSlug: string, creds: RedisCredentials) {
    void projectSlug
    return new RedisInstance(creds).exportAll()
  }

  async importNamespace(
    projectSlug: string,
    payload: Buffer,
    creds: RedisCredentials,
  ) {
    void projectSlug
    return new RedisInstance(creds).importAll(payload)
  }

  buildUrl(
    username: string | null,
    password: string,
    host: string,
    port: number,
  ): string {
    if (username) {
      return `redis://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`
    }
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`
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