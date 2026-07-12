import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { signOperatorWebhookBody } from "./operator-webhook"

describe("signOperatorWebhookBody", () => {
  it("matches sha256= HMAC hex", () => {
    const body = JSON.stringify({ event: "operation.failed" })
    const secret = "test-secret"
    const expected =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
    expect(signOperatorWebhookBody(body, secret)).toBe(expected)
  })
})

describe("operator webhook wiring", () => {
  it("operations module calls notifyOperatorWebhook after terminal marks", () => {
    const ops = readFileSync(
      path.join(import.meta.dirname, "queue/operations.ts"),
      "utf8",
    )
    expect(ops).toContain("notifyOperatorWebhook")
    expect(ops).toContain("void notifyOperatorWebhook(id)")
  })
})
