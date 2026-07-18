import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { eq, db, clusters, nodes } from "@hostrig/db"
import type { ClusterSummary } from "@hostrig/shared"

import { isHetznerConfigured } from "@/lib/core"
import { decryptString, encryptString } from "@/lib/core/crypto"
import { env } from "@/lib/env"
import {
  DEFAULT_CLUSTER_ID,
  decryptKubeconfig,
  encryptKubeconfig,
} from "./client"
import { probeCluster } from "./probe"
import { defaultTraefikOrigin, edgeSetupCommands } from "./public-host"

/** Synthetic nodes row so projects/deployments FKs stay valid under k3s. */
export const CLUSTER_NODE_ID = "k3s-cluster"

export async function ensureClusterPlacementNode(input?: {
  host?: string | null
}): Promise<string> {
  const host = input?.host?.trim() || "k3s"
  const [existing] = await db
    .select()
    .from(nodes)
    .where(eq(nodes.id, CLUSTER_NODE_ID))
    .limit(1)
  if (existing) {
    await db
      .update(nodes)
      .set({
        status: "online",
        host,
        advertiseHost: host,
        lastSeenAt: new Date(),
        meshStatus: null,
        localProxyReady: true,
      })
      .where(eq(nodes.id, CLUSTER_NODE_ID))
    return CLUSTER_NODE_ID
  }
  await db.insert(nodes).values({
    id: CLUSTER_NODE_ID,
    name: "k3s",
    provider: "agent",
    host,
    status: "online",
    advertiseHost: host,
    lastSeenAt: new Date(),
    localProxyReady: true,
  })
  return CLUSTER_NODE_ID
}

export async function getClusterRow() {
  const [row] = await db
    .select()
    .from(clusters)
    .where(eq(clusters.id, DEFAULT_CLUSTER_ID))
    .limit(1)
  return row ?? null
}

/** Map crypto/probe jargon into actions a first-time operator can take. */
export function mapClusterErrorMessage(message: string): string {
  if (
    message.includes("Unsupported state or unable to authenticate data") ||
    message.includes("bad decrypt") ||
    message.includes("Invalid authentication tag") ||
    message.includes("unable to authenticate")
  ) {
    return "Stored kubeconfig could not be decrypted (encryption key may have changed). Disconnect this cluster and reconnect with a fresh kubeconfig."
  }
  if (
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("ETIMEDOUT") ||
    message.includes("certificate")
  ) {
    return `${message} — check that the k3s API is reachable from this control plane, then reconnect if needed.`
  }
  return message
}

export async function requireConnectedKubeconfig(): Promise<string> {
  const row = await getClusterRow()
  if (!row?.kubeconfigEncrypted) {
    throw new Error(
      "No connected k3s cluster. Connect a kubeconfig or create a cluster under Settings → Cluster.",
    )
  }
  const yaml = decryptKubeconfig(row.kubeconfigEncrypted)
  const probe = await probeCluster(yaml)
  if (!probe.ok) {
    throw new Error(
      probe.message ??
        "Cluster kubeconfig is stored but the API is not reachable. Check Settings → Cluster.",
    )
  }
  // Never clobber an in-flight create — probe can succeed while the server is still joining.
  if (row.status !== "connected" && row.status !== "provisioning") {
    await db
      .update(clusters)
      .set({
        status: "connected",
        serverUrl: probe.serverUrl ?? row.serverUrl,
        externalIp: probe.externalIp ?? row.externalIp,
        errorMessage: null,
      })
      .where(eq(clusters.id, DEFAULT_CLUSTER_ID))
  }
  await ensureClusterPlacementNode({
    host: probe.externalIp ?? row.externalIp ?? probe.serverUrl,
  })
  return yaml
}

async function resolveManagedCaps(
  source: ClusterSummary["source"],
  hasKubeconfig: boolean,
): Promise<ClusterSummary["managed"]> {
  // Dynamic import avoids a load-time cycle with providers → cluster-store.
  const { managedCapabilitiesForSource } = await import("./providers")
  const caps = await managedCapabilitiesForSource(source)
  return {
    ...caps,
    // Any stored kubeconfig is viewable by admins (BYO + managed).
    canViewKubeconfig: hasKubeconfig || caps.canViewKubeconfig,
  }
}

function markRemovableNodes(
  nodes: ClusterSummary["nodes"],
  canRemove: boolean,
): ClusterSummary["nodes"] {
  return nodes.map((n) => {
    const isControl = n.roles.some(
      (r) => r === "control-plane" || r === "master",
    )
    return {
      ...n,
      removable: canRemove && !isControl,
    }
  })
}

/**
 * Strip cluster recon details for non-instance-admins (IPs, edge recipes, node inventory).
 * Members still see readiness for deploy UX.
 */
export function redactClusterSummaryForMember(
  summary: ClusterSummary,
): ClusterSummary {
  return {
    ...summary,
    serverUrl: null,
    externalIp: null,
    errorMessage: null,
    nodes: [],
    traefikOrigin: "http://127.0.0.1:80",
    edgeCommands: {
      netbird: "",
      tailscale: "",
      cloudflareOrigin: "",
    },
    hetznerConfigured: false,
    managed: {
      canCreate: false,
      canAddNode: false,
      canRemoveNode: false,
      canViewKubeconfig: false,
      canDestroy: false,
    },
  }
}

export async function getClusterSummary(): Promise<ClusterSummary> {
  const row = await getClusterRow()
  const hetznerConfigured = isHetznerConfigured()
  const traefikOrigin = defaultTraefikOrigin()
  const edgeCommands = edgeSetupCommands(traefikOrigin)
  const source = row?.source ?? null
  const hasKubeconfig = Boolean(row?.kubeconfigEncrypted)
  const managed = await resolveManagedCaps(source, hasKubeconfig)
  const provisioning = row?.status === "provisioning"

  if (!row || !row.kubeconfigEncrypted) {
    const status = provisioning
      ? ("provisioning" as const)
      : (row?.status ?? "disconnected")
    return {
      id: DEFAULT_CLUSTER_ID,
      name: row?.name ?? "default",
      status,
      source,
      serverUrl: row?.serverUrl ?? null,
      externalIp: row?.externalIp ?? null,
      errorMessage: row?.errorMessage ?? null,
      nodeCount: 0,
      readyNodeCount: 0,
      traefikReady: false,
      traefikOrigin,
      edgeCommands,
      nodes: [],
      hetznerConfigured,
      managed: provisioning
        ? { ...managed, canAddNode: false, canRemoveNode: false }
        : managed,
      operation: null,
      createdAt: row?.createdAt?.toISOString() ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    }
  }

  // Probe is observed/ephemeral — do not write clusters.status on GET (avoids poll flapping).
  let probe
  try {
    const yaml = decryptKubeconfig(row.kubeconfigEncrypted)
    probe = await probeCluster(yaml)
  } catch (e) {
    const message = mapClusterErrorMessage(
      e instanceof Error ? e.message : String(e),
    )
    return {
      id: DEFAULT_CLUSTER_ID,
      name: row.name,
      status: provisioning ? ("provisioning" as const) : ("error" as const),
      source: row.source,
      serverUrl: row.serverUrl,
      externalIp: row.externalIp,
      errorMessage: provisioning ? null : message,
      nodeCount: 0,
      readyNodeCount: 0,
      traefikReady: false,
      traefikOrigin,
      edgeCommands,
      nodes: [],
      hetznerConfigured,
      managed: provisioning
        ? { ...managed, canAddNode: false, canRemoveNode: false }
        : managed,
      operation: null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  let status: ClusterSummary["status"]
  if (probe.ok) {
    status = "connected"
  } else if (provisioning) {
    status = "provisioning"
  } else {
    status = "error"
  }
  const origin = probe.traefikOrigin || traefikOrigin
  const caps = provisioning
    ? { ...managed, canAddNode: false, canRemoveNode: false }
    : managed

  return {
    id: DEFAULT_CLUSTER_ID,
    name: row.name,
    status,
    source: row.source,
    serverUrl: probe.serverUrl ?? row.serverUrl,
    externalIp: probe.externalIp ?? row.externalIp,
    errorMessage:
      status === "error"
        ? mapClusterErrorMessage(
            probe.message ?? row.errorMessage ?? "Cluster probe failed",
          )
        : null,
    nodeCount: probe.nodes.length,
    readyNodeCount: probe.nodes.filter((n) => n.ready).length,
    traefikReady: probe.traefikReady,
    traefikOrigin: origin,
    edgeCommands: edgeSetupCommands(origin),
    nodes: markRemovableNodes(probe.nodes, caps.canRemoveNode),
    hetznerConfigured,
    managed: caps,
    operation: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function getStoredKubeconfigYaml(): Promise<{
  kubeconfig: string
  name: string
  source: ClusterSummary["source"]
}> {
  const row = await getClusterRow()
  if (!row?.kubeconfigEncrypted) {
    throw new Error(
      "No kubeconfig stored. Connect or create a cluster under Settings → Cluster.",
    )
  }
  return {
    kubeconfig: decryptKubeconfig(row.kubeconfigEncrypted),
    name: row.name,
    source: row.source,
  }
}

export async function connectByoKubeconfig(input: {
  kubeconfig: string
  name?: string
  nodeToken?: string
  source?: "byo" | "hetzner" | "hetzner_k3s"
}): Promise<ClusterSummary> {
  const probe = await probeCluster(input.kubeconfig)
  if (!probe.ok) {
    throw new Error(probe.message ?? "Could not reach Kubernetes API")
  }

  // Close Traefik NodePort/LoadBalancer public exposure (edge → loopback model).
  try {
    const { ensureTraefikNotPublic } = await import("./traefik-harden")
    const hardened = await ensureTraefikNotPublic(input.kubeconfig)
    if (hardened.patched) {
      console.info(`[hostrig] ${hardened.message}`)
    }
  } catch (e) {
    console.warn(
      "[hostrig] Traefik harden skipped:",
      e instanceof Error ? e.message : e,
    )
  }

  const encrypted = encryptKubeconfig(input.kubeconfig)
  const existing = await getClusterRow()
  const values = {
    id: DEFAULT_CLUSTER_ID,
    name: input.name?.trim() || existing?.name || "default",
    status: "connected" as const,
    source: input.source ?? ("byo" as const),
    serverUrl: probe.serverUrl,
    externalIp: probe.externalIp,
    kubeconfigEncrypted: encrypted,
    errorMessage: null,
    bootstrapTokenHash: null,
    bootstrapTokenExpiresAt: null,
    ...(input.nodeToken?.trim()
      ? {
          nodeTokenEncrypted: encryptString(
            input.nodeToken.trim(),
            env.secretsEncryptionKey,
          ),
        }
      : {}),
  }

  if (existing) {
    await db.update(clusters).set(values).where(eq(clusters.id, DEFAULT_CLUSTER_ID))
  } else {
    await db.insert(clusters).values(values)
  }
  await ensureClusterPlacementNode({ host: probe.externalIp ?? probe.serverUrl })
  return getClusterSummary()
}

export async function disconnectCluster(): Promise<ClusterSummary> {
  const existing = await getClusterRow()

  // Best-effort: tear down active edge addons while kubeconfig still available.
  try {
    const { loadIngressSettings } = await import("@/lib/ingress-settings")
    const { edgeRegistry } = await import("@/lib/k8s/edge/registry")
    const ingress = await loadIngressSettings()
    const provider = edgeRegistry().active(ingress)
    await provider.disconnect?.()
  } catch {
    // edge may already be disconnected
  }

  if (existing?.spawnedServerId) {
    try {
      const { destroySpawnedServer } = await import("./spawned-servers")
      await destroySpawnedServer(existing.spawnedServerId)
    } catch {
      // cloud destroy is best-effort on disconnect
    }
  }

  if (existing) {
    await db
      .update(clusters)
      .set({
        status: "disconnected",
        kubeconfigEncrypted: null,
        nodeTokenEncrypted: null,
        serverUrl: null,
        externalIp: null,
        errorMessage: null,
        bootstrapTokenHash: null,
        bootstrapTokenExpiresAt: null,
        spawnedServerId: null,
        source: null,
      })
      .where(eq(clusters.id, DEFAULT_CLUSTER_ID))
  }
  // Never re-probe a broken kubeconfig after clear — return a clean summary.
  try {
    return await getClusterSummary()
  } catch {
    const hetznerConfigured = isHetznerConfigured()
    const traefikOrigin = defaultTraefikOrigin()
    return {
      id: DEFAULT_CLUSTER_ID,
      name: "default",
      status: "disconnected",
      source: null,
      serverUrl: null,
      externalIp: null,
      errorMessage: null,
      nodeCount: 0,
      readyNodeCount: 0,
      traefikReady: false,
      traefikOrigin,
      edgeCommands: edgeSetupCommands(traefikOrigin),
      nodes: [],
      hetznerConfigured,
      managed: {
        canCreate: false,
        canAddNode: false,
        canRemoveNode: false,
        canViewKubeconfig: false,
        canDestroy: false,
      },
      operation: null,
      createdAt: null,
      updatedAt: null,
    }
  }
}

export function hashBootstrapToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Constant-time compare of bootstrap token digests (hex strings). */
export function bootstrapTokenHashEquals(
  providedToken: string,
  expectedHash: string,
): boolean {
  const a = Buffer.from(hashBootstrapToken(providedToken), "utf8")
  const b = Buffer.from(expectedHash, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function createBootstrapToken(): Promise<{
  token: string
  expiresAt: Date
}> {
  const token = `cb_${randomBytes(24).toString("base64url")}`
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
  const existing = await getClusterRow()
  const values = {
    id: DEFAULT_CLUSTER_ID,
    name: existing?.name ?? "default",
    status: "provisioning" as const,
    source: "hetzner" as const,
    bootstrapTokenHash: hashBootstrapToken(token),
    bootstrapTokenExpiresAt: expiresAt,
    errorMessage: null,
  }
  if (existing) {
    await db.update(clusters).set(values).where(eq(clusters.id, DEFAULT_CLUSTER_ID))
  } else {
    await db.insert(clusters).values(values)
  }
  return { token, expiresAt }
}

export async function completeBootstrap(input: {
  token: string
  kubeconfig: string
  nodeToken?: string
  externalIp?: string
}): Promise<{ ok: true }> {
  const row = await getClusterRow()
  if (!row?.bootstrapTokenHash || !row.bootstrapTokenExpiresAt) {
    throw new Error("No pending cluster bootstrap")
  }
  if (row.bootstrapTokenExpiresAt.getTime() < Date.now()) {
    throw new Error("Bootstrap token expired")
  }
  if (!bootstrapTokenHashEquals(input.token, row.bootstrapTokenHash)) {
    throw new Error("Invalid bootstrap token")
  }

  let kubeconfig = input.kubeconfig
  if (input.externalIp) {
    const host = formatHostForUrl(input.externalIp)
    kubeconfig = kubeconfig.replace(
      /server:\s*https?:\/\/127\.0\.0\.1:6443/g,
      `server: https://${host}:6443`,
    )
    kubeconfig = kubeconfig.replace(
      /server:\s*https?:\/\/localhost:6443/g,
      `server: https://${host}:6443`,
    )
  }

  const probe = await probeCluster(kubeconfig)
  await db
    .update(clusters)
    .set({
      status: probe.ok ? "connected" : "error",
      kubeconfigEncrypted: encryptKubeconfig(kubeconfig),
      nodeTokenEncrypted: input.nodeToken
        ? encryptString(input.nodeToken, env.secretsEncryptionKey)
        : row.nodeTokenEncrypted,
      serverUrl: probe.serverUrl,
      externalIp: input.externalIp ?? probe.externalIp,
      errorMessage: probe.ok ? null : (probe.message ?? "Probe failed after bootstrap"),
      bootstrapTokenHash: null,
      bootstrapTokenExpiresAt: null,
    })
    .where(eq(clusters.id, DEFAULT_CLUSTER_ID))

  if (!probe.ok) {
    throw new Error(probe.message ?? "Cluster connected but API probe failed")
  }
  await ensureClusterPlacementNode({
    host: input.externalIp ?? probe.externalIp ?? probe.serverUrl,
  })
  return { ok: true }
}

export async function getNodeJoinToken(): Promise<{
  serverUrl: string
  token: string
} | null> {
  const row = await getClusterRow()
  if (!row?.nodeTokenEncrypted) return null
  const token = decryptString(row.nodeTokenEncrypted, env.secretsEncryptionKey)
  if (row.externalIp) {
    const host = formatHostForUrl(row.externalIp)
    return { serverUrl: `https://${host}:6443`, token }
  }
  const fromApi = row.serverUrl?.trim().replace(/\/$/, "")
  if (fromApi) return { serverUrl: fromApi, token }
  return null
}

export async function getWorkerJoinScript(input?: {
  nodeName?: string
}): Promise<{
  serverUrl: string
  token: string
  script: string
  nodeName: string
}> {
  const join = await getNodeJoinToken()
  if (!join) {
    throw new Error(
      "No k3s join token is stored. Managed Hetzner clusters store it on create. For BYO, paste the server node-token under Settings → Cluster (Store join token), then retry.",
    )
  }
  const { buildSelfHostedWorkerJoinScript } = await import(
    "@/lib/core/spawners/k3s-userdata"
  )
  const nodeName =
    input?.nodeName?.trim() || `worker-${crypto.randomUUID().slice(0, 8)}`
  return {
    serverUrl: join.serverUrl,
    token: join.token,
    nodeName,
    script: buildSelfHostedWorkerJoinScript({
      serverUrl: join.serverUrl,
      nodeToken: join.token,
      nodeName,
    }),
  }
}

function formatHostForUrl(host: string): string {
  // IPv6 literals must be bracketed in URLs
  if (host.includes(":") && !host.startsWith("[")) return `[${host}]`
  return host
}

export async function storeNodeJoinToken(token: string): Promise<void> {
  await db
    .update(clusters)
    .set({
      nodeTokenEncrypted: encryptString(token, env.secretsEncryptionKey),
    })
    .where(eq(clusters.id, DEFAULT_CLUSTER_ID))
}
