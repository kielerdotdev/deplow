/**
 * Weighted scenario factories — mirrors Sentry ingest-load-tester task weights
 * and PostHog persona-driven event mixes.
 */
import { pick, weighted } from "./rng.mjs"
import { pickEnv, pickRelease, pickService, TENANTS, TIERS } from "./catalog.mjs"

/** @typedef {{ id: string, weight: number | ((tl: object) => number), build: Function }} ScenarioDef */

export const SCENARIOS = [
  {
    id: "checkout",
    weight: 22,
    root: "checkout-api",
    depth: [3, 6],
    medianMs: 180,
    description: "Full checkout → payments → inventory",
  },
  {
    id: "browse",
    weight: 28,
    root: "frontend-bff",
    depth: [2, 4],
    medianMs: 60,
    description: "Catalog browse / product page",
  },
  {
    id: "search",
    weight: 12,
    root: "search-api",
    depth: [2, 3],
    medianMs: 45,
    description: "Search + suggest",
  },
  {
    id: "auth",
    weight: 8,
    root: "auth-api",
    depth: [2, 3],
    medianMs: 35,
    description: "Login / refresh",
  },
  {
    id: "worker",
    weight: 10,
    root: "worker-orders",
    depth: [2, 5],
    medianMs: 220,
    description: "Async order pipeline",
  },
  {
    id: "graphql",
    weight: 8,
    root: "frontend-bff",
    depth: [3, 5],
    medianMs: 90,
    description: "GraphQL fan-out",
  },
  {
    id: "payment_fail",
    weight: (tl) => (tl.regression || tl.errorStorm ? 18 : 4),
    root: "payments-api",
    depth: [3, 5],
    medianMs: 250,
    forceError: true,
    description: "Stripe decline / timeout",
  },
  {
    id: "cache_stampede",
    weight: (tl) => (tl.slowBand ? 14 : 3),
    root: "checkout-api",
    depth: [2, 4],
    medianMs: 400,
    description: "Redis miss storm",
  },
  {
    id: "healthcheck",
    weight: 14,
    root: "gateway",
    depth: [1, 1],
    medianMs: 4,
    synthetic: true,
    description: "Synthetic /health probes (exclude-internal)",
  },
  {
    id: "bot_crawl",
    weight: 5,
    root: "gateway",
    depth: [1, 2],
    medianMs: 20,
    synthetic: true,
    description: "Bot / scanner noise",
  },
]

export function pickScenario(rng, tl) {
  const weightedList = SCENARIOS.map((s) => ({
    ...s,
    weight: typeof s.weight === "function" ? s.weight(tl) : s.weight,
  }))
  // trafficMul nudges toward interactive scenarios during peak
  const boosted = weightedList.map((s) => {
    if (s.synthetic) return s
    return { ...s, weight: s.weight * (0.7 + tl.trafficMul * 0.3) }
  })
  const def = weighted(rng, boosted)
  const release = pickRelease(rng, tl)
  const env = pickEnv(rng)
  const root = pickService(rng, def.root)
  const tenant = pick(rng, TENANTS)
  const tier = weighted(rng, TIERS)

  return {
    id: def.id,
    def,
    release,
    env,
    region: pick(rng, ["eu-west-1", "us-east-1", "ap-southeast-1"]),
    root,
    tenant,
    tier,
    synthetic: Boolean(def.synthetic),
    forceError: Boolean(def.forceError),
    tl,
    depth:
      def.depth[0] +
      Math.floor(rng() * (def.depth[1] - def.depth[0] + 1)),
    medianMs: def.medianMs,
  }
}
