import type { ClusterSource } from "@deplow/shared"

import { getClusterRow } from "../cluster-store"
import { HetznerCloudInitProvider } from "./hetzner"
import type {
  ManagedClusterCapabilities,
  ManagedClusterProvider,
  ManagedClusterProviderId,
} from "./types"

/** Product surface: cloud-init Hetzner only. */
const providers: ManagedClusterProvider[] = [new HetznerCloudInitProvider()]

const byId = new Map(providers.map((p) => [p.id, p]))

export function listManagedClusterProviders(): ManagedClusterProvider[] {
  return [...providers]
}

export function getManagedClusterProvider(
  id: ManagedClusterProviderId,
): ManagedClusterProvider {
  const p = byId.get(id)
  if (!p) {
    throw new Error(`Unknown managed cluster provider: ${id}`)
  }
  return p
}

/** Active provider for the connected/provisioning cluster, if managed. */
export async function resolveActiveManagedProvider(): Promise<ManagedClusterProvider | null> {
  const row = await getClusterRow()
  if (!row?.source || row.source === "byo") return null
  // Legacy hetzner_k3s rows: no longer managed via UI; treat as unmanaged.
  if (row.source === "hetzner_k3s") return null
  return byId.get(row.source as ManagedClusterProviderId) ?? null
}

export function isManagedSource(
  source: ClusterSource | null | undefined,
): source is ManagedClusterProviderId {
  return source === "hetzner"
}

/** Capabilities for the active cluster (or disconnected defaults). */
export async function managedCapabilitiesForSource(
  source: ClusterSource | null | undefined,
): Promise<ManagedClusterCapabilities> {
  if (!isManagedSource(source)) {
    return {
      canCreate: false,
      canAddNode: false,
      canRemoveNode: false,
      canViewKubeconfig: Boolean(source === "byo" || source === "hetzner_k3s"),
      canDestroy: false,
    }
  }
  return getManagedClusterProvider(source).capabilities()
}

/** Test helper */
export function resetManagedProvidersForTests(
  next?: ManagedClusterProvider[],
): void {
  byId.clear()
  const list = next ?? [new HetznerCloudInitProvider()]
  for (const p of list) byId.set(p.id, p)
}
