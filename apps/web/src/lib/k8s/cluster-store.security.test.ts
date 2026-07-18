import { describe, expect, it } from "vitest"

import {
  bootstrapTokenHashEquals,
  hashBootstrapToken,
  redactClusterSummaryForMember,
} from "./cluster-store"
import type { ClusterSummary } from "@hostrig/shared"

function sampleSummary(): ClusterSummary {
  return {
    id: "default",
    name: "default",
    status: "connected",
    source: "hetzner",
    serverUrl: "https://203.0.113.10:6443",
    externalIp: "203.0.113.10",
    errorMessage: "secret-ish",
    nodeCount: 2,
    readyNodeCount: 2,
    traefikReady: true,
    traefikOrigin: "http://203.0.113.10:80",
    edgeCommands: {
      netbird: "nb",
      tailscale: "ts",
      cloudflareOrigin: "cf",
    },
    nodes: [
      {
        name: "node-1",
        roles: ["control-plane"],
        ready: true,
        externalIp: "203.0.113.10",
      },
    ],
    hetznerConfigured: true,
    managed: {
      canCreate: true,
      canAddNode: true,
      canRemoveNode: true,
      canViewKubeconfig: true,
      canDestroy: true,
    },
    operation: null,
    createdAt: null,
    updatedAt: null,
  }
}

describe("bootstrapTokenHashEquals", () => {
  it("accepts matching token and rejects wrong token", () => {
    const token = "cb_testtokenvalue123456789012"
    const hash = hashBootstrapToken(token)
    expect(bootstrapTokenHashEquals(token, hash)).toBe(true)
    expect(bootstrapTokenHashEquals("cb_wrong", hash)).toBe(false)
  })
})

describe("redactClusterSummaryForMember", () => {
  it("strips recon fields but keeps readiness counts", () => {
    const redacted = redactClusterSummaryForMember(sampleSummary())
    expect(redacted.status).toBe("connected")
    expect(redacted.traefikReady).toBe(true)
    expect(redacted.nodeCount).toBe(2)
    expect(redacted.serverUrl).toBeNull()
    expect(redacted.externalIp).toBeNull()
    expect(redacted.nodes).toEqual([])
    expect(redacted.edgeCommands.netbird).toBe("")
    expect(redacted.hetznerConfigured).toBe(false)
    expect(redacted.managed.canViewKubeconfig).toBe(false)
  })
})
