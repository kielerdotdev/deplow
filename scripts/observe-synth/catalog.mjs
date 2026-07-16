import { pick, weighted } from "./rng.mjs"

/** Service catalog — like Sentry ops list + PostHog demo app surface. */
export const SERVICES = [
  {
    name: "gateway",
    kind: "edge",
    lang: "go",
    routes: ["GET /", "GET /health", "GET /readyz", "POST /api/v1/checkout", "GET /api/v1/cart"],
  },
  {
    name: "checkout-api",
    kind: "http",
    lang: "nodejs",
    routes: [
      "POST /checkout",
      "POST /checkout/confirm",
      "GET /checkout/{id}",
      "POST /checkout/coupon",
    ],
  },
  {
    name: "payments-api",
    kind: "http",
    lang: "nodejs",
    routes: ["POST /charge", "POST /refund", "GET /payment_methods", "POST /capture"],
  },
  {
    name: "inventory",
    kind: "http",
    lang: "go",
    routes: ["GET /stock/{sku}", "POST /reserve", "POST /release", "GET /warehouses"],
  },
  {
    name: "frontend-bff",
    kind: "http",
    lang: "nodejs",
    routes: [
      "GET /page/home",
      "GET /page/product",
      "POST /action/add-to-cart",
      "POST /graphql",
    ],
  },
  {
    name: "worker-orders",
    kind: "worker",
    lang: "python",
    routes: [
      "process.order.created",
      "process.order.paid",
      "process.fulfillment",
      "process.email.receipt",
    ],
  },
  {
    name: "search-api",
    kind: "http",
    lang: "go",
    routes: ["GET /search", "POST /index", "GET /suggest"],
  },
  {
    name: "auth-api",
    kind: "http",
    lang: "nodejs",
    routes: ["POST /login", "POST /token/refresh", "GET /session", "POST /logout"],
  },
]

export const RELEASES = [
  { version: "1.2.0", weight: 18, latencyMul: 1.0, errorMul: 0.65 },
  { version: "1.2.1", weight: 32, latencyMul: 0.92, errorMul: 0.55 },
  { version: "1.3.0", weight: 38, latencyMul: 1.75, errorMul: 2.6 }, // regression
  { version: "1.3.1-rc.1", weight: 12, latencyMul: 1.15, errorMul: 1.05 },
]

export const ENVIRONMENTS = [
  ["production", 88],
  ["staging", 10],
  ["test", 2],
]

export const REGIONS = ["eu-west-1", "us-east-1", "ap-southeast-1"]
export const TENANTS = ["acme", "globex", "initech", "umbrella", "stark", "wonka"]
export const TIERS = [
  ["free", 45],
  ["pro", 40],
  ["enterprise", 15],
]

export const PEERS = [
  "api.stripe.com",
  "shipping.partner.io",
  "cdn.assets.example",
  "s3.us-east-1.amazonaws.com",
  "hooks.slack.com",
  "api.sendgrid.com",
]

export const DB_SYSTEMS = ["postgresql", "redis", "mysql"]

export function pickRelease(rng, tl) {
  if (tl.regression) {
    return weighted(
      rng,
      RELEASES.map((r) =>
        r.version.startsWith("1.3.0") ? { ...r, weight: r.weight * 3 } : r,
      ),
    )
  }
  if (tl.canary) {
    return weighted(
      rng,
      RELEASES.map((r) =>
        r.version.includes("rc") ? { ...r, weight: r.weight * 4 } : r,
      ),
    )
  }
  return weighted(rng, RELEASES)
}

export function pickEnv(rng) {
  return weighted(rng, ENVIRONMENTS)
}

export function serviceByName(name) {
  return SERVICES.find((s) => s.name === name) ?? SERVICES[0]
}

export function pickService(rng, prefer) {
  if (prefer) {
    const s = serviceByName(prefer)
    if (s) return s
  }
  return pick(rng, SERVICES)
}
