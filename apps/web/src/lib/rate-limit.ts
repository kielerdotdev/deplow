/**
 * Simple in-process sliding-window rate limiter.
 * Suitable for single-node control planes; not a distributed limiter.
 */

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number }

type Bucket = {
  /** Timestamps (ms) of recent hits within the window */
  hits: number[]
}

const buckets = new Map<string, Bucket>()

/** Best-effort prune to avoid unbounded growth */
const MAX_KEYS = 20_000

function pruneIfNeeded() {
  if (buckets.size <= MAX_KEYS) return
  // Drop oldest half of keys (Map insertion order)
  const drop = Math.floor(buckets.size / 2)
  let i = 0
  for (const key of buckets.keys()) {
    buckets.delete(key)
    if (++i >= drop) break
  }
}

/**
 * Record a hit and return whether the caller is within limit.
 * @param key - e.g. `auth:1.2.3.4` or `git-webhook:service-id`
 * @param limit - max hits per window
 * @param windowMs - window length
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  pruneIfNeeded()
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { hits: [] }
    buckets.set(key, bucket)
  }
  const cutoff = now - windowMs
  bucket.hits = bucket.hits.filter((t) => t > cutoff)
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    return { ok: false, retryAfterSec }
  }
  bucket.hits.push(now)
  return { ok: true, remaining: Math.max(0, limit - bucket.hits.length) }
}

/** Test helper */
export function resetRateLimitsForTests() {
  buckets.clear()
}

/**
 * Whether to trust X-Forwarded-For / X-Real-IP for rate limiting.
 * Only enable when a reverse proxy overwrites these headers (HOSTRIG_TRUST_PROXY=1).
 * Default off so clients cannot rotate spoofed IPs to bypass auth limits.
 */
export function trustProxyEnabled(): boolean {
  const raw = (process.env.HOSTRIG_TRUST_PROXY ?? "").trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

export function clientIpFromRequest(request: Request): string {
  if (trustProxyEnabled()) {
    const xff = request.headers.get("x-forwarded-for")
    if (xff) {
      const first = xff.split(",")[0]?.trim()
      if (first) return first.slice(0, 64)
    }
    const real = request.headers.get("x-real-ip")?.trim()
    if (real) return real.slice(0, 64)
  }
  return "unknown"
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSec),
      "Cache-Control": "no-store",
    },
  })
}
