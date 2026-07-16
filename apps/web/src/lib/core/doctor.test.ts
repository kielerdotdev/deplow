import { describe, expect, it } from "vitest"

import {
  doctorSummary,
  evaluateDoctorChecks,
  isWebhookBodyTooLarge,
  MAX_WEBHOOK_BODY_BYTES,
} from "./doctor"

describe("evaluateDoctorChecks", () => {
  it("marks healthy probes as ok", () => {
    const checks = evaluateDoctorChecks({
      dockerOk: true,
      runscOk: true,
      buildkitOk: true,
      railpackOk: true,
      postgresOk: true,
      redisOk: true,
      minioOk: true,
      caddyOk: true,
      baseDomain: "apps.example.com",
      secretsConfigured: true,
      nodeEnv: "production",
    })
    expect(checks.filter((c) => c.status !== "skip").every((c) => c.status === "ok")).toBe(
      true,
    )
    expect(doctorSummary(checks).ok).toBe(true)
  })

  it("fails docker and runsc when missing", () => {
    const checks = evaluateDoctorChecks({
      dockerOk: false,
      runscOk: false,
      buildkitOk: false,
      railpackOk: false,
      postgresOk: false,
      redisOk: false,
      minioOk: false,
      caddyOk: false,
      baseDomain: "",
      secretsConfigured: false,
      nodeEnv: "production",
    })
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]))
    expect(byId.docker?.status).toBe("fail")
    expect(byId.runsc?.status).toBe("fail")
    expect(byId.compose?.status).toBe("fail")
    expect(byId["base-domain"]?.status).toBe("warn")
    expect(byId.secrets?.status).toBe("fail")
    expect(doctorSummary(checks).failCount).toBeGreaterThan(0)
  })

  it("warns on missing railpack/buildkit instead of fail", () => {
    const checks = evaluateDoctorChecks({
      dockerOk: true,
      runscOk: true,
      buildkitOk: false,
      railpackOk: false,
      postgresOk: true,
      redisOk: true,
      minioOk: true,
      caddyOk: true,
      baseDomain: "apps.localhost",
      secretsConfigured: true,
    })
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]))
    expect(byId.buildkit?.status).toBe("warn")
    expect(byId.railpack?.status).toBe("warn")
    expect(doctorSummary(checks).ok).toBe(true)
  })
})

describe("webhook body limit", () => {
  it("rejects bodies over MAX_WEBHOOK_BODY_BYTES", () => {
    expect(MAX_WEBHOOK_BODY_BYTES).toBe(1_048_576)
    expect(isWebhookBodyTooLarge(MAX_WEBHOOK_BODY_BYTES)).toBe(false)
    expect(isWebhookBodyTooLarge(MAX_WEBHOOK_BODY_BYTES + 1)).toBe(true)
  })
})
