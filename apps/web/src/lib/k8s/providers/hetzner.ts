/**
 * Managed provider: single Hetzner VM (cloud-init k3s server) + k3s agent workers.
 * Source id: "hetzner"
 */
import { eq, db, spawnedServers } from "@deplow/db"

import {
  createServerSpawners,
  getServerSpawner,
  isHetznerConfigured,
  isPublicInternetUrl,
  loadPlatformConfig,
} from "@/lib/core"
import { destroySpawnedServer } from "@/lib/k8s/spawned-servers"
import {
  buildK3sAgentUserData,
  buildK3sServerUserData,
} from "@/lib/core/spawners/k3s-userdata"
import { env } from "@/lib/env"

import { DEFAULT_CLUSTER_ID } from "../client"
import {
  createBootstrapToken,
  getClusterRow,
  getNodeJoinToken,
} from "../cluster-store"
import type {
  AddManagedNodeInput,
  AddManagedNodeResult,
  CreateManagedClusterInput,
  CreateManagedClusterResult,
  ManagedClusterCapabilities,
  ManagedClusterProvider,
  RemoveManagedNodeInput,
  RemoveManagedNodeResult,
} from "./types"
import {
  assertWorkerNode,
  deleteKubernetesNode,
  readStoredKubeconfig,
  sanitizeClusterName,
} from "./utils"

function parseMetadata(json: string | null): Record<string, unknown> {
  if (!json) return {}
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

export class HetznerCloudInitProvider implements ManagedClusterProvider {
  readonly id = "hetzner" as const
  readonly label = "Hetzner (cloud-init k3s)"

  isConfigured(): boolean {
    return isHetznerConfigured()
  }

  capabilities(): ManagedClusterCapabilities {
    const configured = this.isConfigured()
    return {
      canCreate: configured,
      canAddNode: configured,
      canRemoveNode: configured,
      canViewKubeconfig: true,
      canDestroy: false,
    }
  }

  async create(
    input: CreateManagedClusterInput,
  ): Promise<CreateManagedClusterResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "Hetzner is not configured. Set DEPLOW_HETZNER_API_TOKEN on the control plane.",
      )
    }
    const publicUrl = env.publicControlPlaneUrl.replace(/\/$/, "")
    if (!isPublicInternetUrl(publicUrl)) {
      throw new Error(
        `DEPLOW_PUBLIC_URL must be reachable from the Internet (got "${publicUrl}") so the VM can POST kubeconfig.`,
      )
    }

    const name =
      sanitizeClusterName(
        input.name?.trim() || `k3s-${crypto.randomUUID().slice(0, 8)}`,
      ) || `k3s-${crypto.randomUUID().slice(0, 8)}`

    const { token } = await createBootstrapToken()
    const userData = buildK3sServerUserData({
      controlPlaneUrl: publicUrl,
      bootstrapToken: token,
      nodeName: name,
    })

    const spawners = createServerSpawners(loadPlatformConfig())
    const spawner = getServerSpawner(spawners, "hetzner")
    const spawned = await spawner.spawn({
      name,
      serverType: input.serverType?.trim() || env.hetznerServerType,
      location: input.location?.trim() || env.hetznerLocation,
      userData,
      labels: {
        "deplow.role": "k3s-server",
      },
    })

    const id = crypto.randomUUID()
    await db.insert(spawnedServers).values({
      id,
      provider: "hetzner",
      externalId: spawned.id,
      name: spawned.name,
      ip: spawned.ip,
      status: spawned.status,
      metadataJson: JSON.stringify({
        ...(spawned.metadata ?? {}),
        "deplow.role": "k3s-server",
        k8sNodeName: name,
      }),
    })

    const { clusters } = await import("@deplow/db")
    await db
      .update(clusters)
      .set({
        name,
        status: "provisioning",
        source: "hetzner",
        externalIp: spawned.ip,
        spawnedServerId: id,
        errorMessage: null,
      })
      .where(eq(clusters.id, DEFAULT_CLUSTER_ID))

    return { spawnedServerId: id, ip: spawned.ip, name }
  }

  async addNode(input: AddManagedNodeInput): Promise<AddManagedNodeResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "Hetzner is not configured. Set DEPLOW_HETZNER_API_TOKEN on the control plane.",
      )
    }
    const join = await getNodeJoinToken()
    if (!join) {
      throw new Error(
        "Cluster has no join token yet. Create the cluster on Hetzner (or store a node token) first.",
      )
    }

    const name =
      sanitizeClusterName(
        input.name?.trim() || `worker-${crypto.randomUUID().slice(0, 8)}`,
      ) || `worker-${crypto.randomUUID().slice(0, 8)}`

    const userData = buildK3sAgentUserData({
      serverUrl: join.serverUrl,
      nodeToken: join.token,
      nodeName: name,
    })

    const spawners = createServerSpawners(loadPlatformConfig())
    const spawner = getServerSpawner(spawners, "hetzner")
    const spawned = await spawner.spawn({
      name,
      serverType: input.serverType?.trim() || env.hetznerServerType,
      location: input.location?.trim() || env.hetznerLocation,
      userData,
      labels: {
        "deplow.role": "k3s-agent",
      },
    })

    const id = crypto.randomUUID()
    await db.insert(spawnedServers).values({
      id,
      provider: "hetzner",
      externalId: spawned.id,
      name: spawned.name,
      ip: spawned.ip,
      status: spawned.status,
      metadataJson: JSON.stringify({
        ...(spawned.metadata ?? {}),
        "deplow.role": "k3s-agent",
        k8sNodeName: name,
      }),
    })

    return { spawnedServerId: id, ip: spawned.ip, name }
  }

  async removeNode(
    input: RemoveManagedNodeInput,
  ): Promise<RemoveManagedNodeResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "Hetzner is not configured. Set DEPLOW_HETZNER_API_TOKEN on the control plane.",
      )
    }
    const nodeName = input.nodeName.trim()
    if (!nodeName) throw new Error("nodeName is required")

    await assertWorkerNode(nodeName)

    const rows = await db.select().from(spawnedServers)
    const match = rows.find((r) => {
      const meta = parseMetadata(r.metadataJson)
      const role = String(meta["deplow.role"] ?? "")
      if (role === "k3s-server") return false
      const k8sName = String(meta.k8sNodeName ?? r.name)
      return k8sName === nodeName || r.name === nodeName
    })

    if (match) {
      await destroySpawnedServer(match.id)
    } else {
      // Best-effort: try Hetzner destroy via spawner if we only know the name
      // (node may have been added outside our spawn table).
      throw new Error(
        `No managed Hetzner worker record for node "${nodeName}". ` +
          "Only workers spawned from this control plane can be removed here.",
      )
    }

    try {
      await deleteKubernetesNode(nodeName)
    } catch {
      // VM is gone; API cleanup is best-effort
    }

    return {
      nodeName,
      message: "Worker VM destroyed and node removed from the cluster.",
    }
  }

  async getKubeconfig(): Promise<string> {
    return readStoredKubeconfig()
  }
}

/** Resolve whether the active cluster row is this provider. */
export async function isHetznerCloudInitCluster(): Promise<boolean> {
  const row = await getClusterRow()
  return row?.source === "hetzner"
}
