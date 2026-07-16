import Redis from "ioredis"

import { env } from "@/lib/env"

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.queueRedisUrl, { maxRetriesPerRequest: null })
  }
  return redis
}

export async function checkObserveQuota(input: {
  sentryId: number
  quotaPer5m: number
  quotaPerHour: number
  quotaPerMonth: number
}): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const r = getRedis()
  const now = Date.now()
  const windows = [
    { key: `observe:q:${input.sentryId}:5m`, ttl: 300, limit: input.quotaPer5m },
    {
      key: `observe:q:${input.sentryId}:h`,
      ttl: 3600,
      limit: input.quotaPerHour,
    },
    {
      key: `observe:q:${input.sentryId}:mo`,
      ttl: 2_592_000,
      limit: input.quotaPerMonth,
    },
  ] as const

  for (const w of windows) {
    const count = await r.incr(w.key)
    if (count === 1) {
      await r.expire(w.key, w.ttl)
    }
    if (count > w.limit) {
      const ttl = await r.ttl(w.key)
      return { ok: false, retryAfterSec: ttl > 0 ? ttl : 60 }
    }
  }
  void now
  return { ok: true }
}
