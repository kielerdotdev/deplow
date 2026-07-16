import { describe, expect, it } from "vitest"

import {
  agentClaimRequestSchema,
  agentDeployJobPayloadSchema,
  agentJobCompleteSchema,
  agentJoinRequestSchema,
  createJoinTokenInputSchema,
} from "./agent"

describe("agent schemas", () => {
  it("parses join request", () => {
    const parsed = agentJoinRequestSchema.parse({
      joinToken: "dj_" + "a".repeat(40),
      name: "edge-1",
      advertiseHost: "1.2.3.4",
    })
    expect(parsed.name).toBe("edge-1")
  })

  it("parses deploy payload", () => {
    const parsed = agentDeployJobPayloadSchema.parse({
      operationId: "op",
      deploymentId: "dep",
      serviceId: "svc",
      projectId: "proj",
      nodeId: "node",
      serviceName: "web",
      serviceType: "web",
      projectSlug: "acme",
      env: { PORT: "80" },
    })
    expect(parsed.serviceType).toBe("web")
  })

  it("parses claim / complete / create token", () => {
    expect(agentClaimRequestSchema.parse({}).waitMs).toBe(25_000)
    expect(
      agentJobCompleteSchema.parse({
        ok: true,
        result: { publishedPort: 32768, advertiseHost: "10.0.0.1" },
      }).ok,
    ).toBe(true)
    expect(createJoinTokenInputSchema.parse({}).ttlSeconds).toBe(3600)
  })
})
