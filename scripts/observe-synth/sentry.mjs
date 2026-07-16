/**
 * Sentry envelope errors — stable groups (fingerprintable) like ingest-load-tester
 * RandomEventTask event groups.
 */
import { pick, weighted, hex } from "./rng.mjs"
import { SERVICES, pickRelease, ENVIRONMENTS, TENANTS } from "./catalog.mjs"

export const ERROR_GROUPS = [
  {
    id: "typeerror",
    weight: 28,
    type: "TypeError",
    value: "Cannot read properties of undefined (reading 'id')",
    transaction: "POST /checkout/confirm",
    service: "checkout-api",
    frames: [
      { filename: "node_modules/express/lib/router.js", function: "handle", in_app: false },
      {
        filename: "src/services/checkout.ts",
        function: "confirmCheckout",
        lineno: 142,
        colno: 18,
        in_app: true,
      },
      {
        filename: "src/routes/checkout.ts",
        function: "postConfirm",
        lineno: 58,
        in_app: true,
      },
    ],
  },
  {
    id: "payment",
    weight: 22,
    type: "PaymentError",
    value: "card_declined: insufficient_funds",
    transaction: "POST /charge",
    service: "payments-api",
    frames: [
      { filename: "node_modules/stripe/lib/StripeResource.js", function: "_request", in_app: false },
      {
        filename: "src/payments/charge.ts",
        function: "createCharge",
        lineno: 88,
        colno: 5,
        in_app: true,
      },
    ],
  },
  {
    id: "timeout",
    weight: 20,
    type: "TimeoutError",
    value: "Upstream deadline exceeded calling inventory",
    transaction: "POST /reserve",
    service: "inventory",
    frames: [
      {
        filename: "src/clients/http.ts",
        function: "request",
        lineno: 210,
        in_app: true,
      },
      {
        filename: "src/inventory/reserve.ts",
        function: "reserveStock",
        lineno: 44,
        in_app: true,
      },
    ],
  },
  {
    id: "validation",
    weight: 12,
    type: "ValidationError",
    value: "coupon code expired",
    transaction: "POST /checkout/coupon",
    service: "checkout-api",
    frames: [
      {
        filename: "src/checkout/coupon.ts",
        function: "applyCoupon",
        lineno: 31,
        in_app: true,
      },
    ],
  },
  {
    id: "db",
    weight: 10,
    type: "DatabaseError",
    value: "deadlock detected",
    transaction: "process.order.paid",
    service: "worker-orders",
    frames: [
      { filename: "node_modules/pg/lib/client.js", function: "query", in_app: false },
      {
        filename: "src/workers/orders.py",
        function: "on_order_paid",
        lineno: 119,
        in_app: true,
      },
    ],
  },
  {
    id: "nullref",
    weight: 8,
    type: "TypeError",
    value: "Cannot read properties of null (reading 'sku')",
    transaction: "GET /page/product",
    service: "frontend-bff",
    frames: [
      {
        filename: "src/bff/product.ts",
        function: "loadProduct",
        lineno: 67,
        in_app: true,
      },
    ],
  },
]

export async function postSentryError(rng, { baseUrl, dsn, parsed, t, group, tl, idx }) {
  const eventId = hex(16)
  const release = pickRelease(rng, tl)
  const service =
    SERVICES.find((s) => s.name === group.service) ?? pick(rng, SERVICES)
  // Slight message variance so volume looks real but fingerprint stays groupable
  const valueSuffix =
    rng() < 0.15 ? ` (tenant=${pick(rng, TENANTS)})` : ""
  const event = {
    event_id: eventId,
    timestamp: t / 1000,
    platform: service.lang === "python" ? "python" : "node",
    level: "error",
    environment: weighted(rng, ENVIRONMENTS),
    release: release.version,
    transaction: group.transaction,
    server_name: service.name,
    fingerprint: [group.id, group.type],
    tags: {
      service: service.name,
      "tenant.id": pick(rng, TENANTS),
      loadgen: "1",
      scenario: group.id,
    },
    message: `${group.type}: ${group.value}${valueSuffix}`,
    exception: {
      values: [
        {
          type: group.type,
          value: `${group.value}${valueSuffix}`,
          stacktrace: {
            frames: group.frames.map((f, i) => ({
              ...f,
              lineno: f.lineno ? f.lineno + (idx % 3) : undefined,
            })),
          },
        },
      ],
    },
    breadcrumbs: {
      values: [
        {
          type: "http",
          category: "http",
          level: "info",
          message: "GET /health",
          timestamp: t / 1000 - 1.2,
        },
        {
          type: "default",
          category: "query",
          level: "info",
          message: "SELECT 1 FROM sessions",
          timestamp: t / 1000 - 0.4,
        },
        {
          type: "default",
          category: "console",
          level: "warning",
          message: "retry scheduled",
          timestamp: t / 1000 - 0.15,
        },
      ],
    },
    contexts: {
      trace: {
        trace_id: hex(16),
        span_id: hex(8),
        op: "http.server",
      },
      runtime: {
        name: service.lang === "python" ? "CPython" : "node",
        version: service.lang === "python" ? "3.12.0" : "20.11.0",
      },
    },
  }

  const header = JSON.stringify({
    event_id: eventId,
    dsn,
    sent_at: new Date(t).toISOString(),
  })
  const item = JSON.stringify({
    type: "event",
    content_type: "application/json",
  })
  const body = `${header}\n${item}\n${JSON.stringify(event)}\n`
  try {
    const res = await fetch(`${baseUrl}/api/${parsed.sentryId}/envelope`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_key=${parsed.publicKey}`,
      },
      body,
    })
    return res.ok || res.status === 200
  } catch {
    return false
  }
}

