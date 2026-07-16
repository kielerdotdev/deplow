import { randomBytes } from "node:crypto"

export function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

export function weighted(rng, items) {
  if (Array.isArray(items[0])) {
    const total = items.reduce((s, [, w]) => s + w, 0)
    let r = rng() * total
    for (const [v, w] of items) {
      r -= w
      if (r <= 0) return v
    }
    return items[items.length - 1][0]
  }
  const total = items.reduce((s, x) => s + (x.weight ?? 1), 0)
  let r = rng() * total
  for (const x of items) {
    r -= x.weight ?? 1
    if (r <= 0) return x
  }
  return items[items.length - 1]
}

/** Log-normal latency sample (Sentry/spangen style long-tail). */
export function logNormal(rng, medianMs, sigma = 0.55) {
  const u1 = Math.max(rng(), 1e-9)
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return Math.max(0.4, medianMs * Math.exp(sigma * z))
}

export function hex(bytes) {
  return randomBytes(bytes).toString("hex")
}
