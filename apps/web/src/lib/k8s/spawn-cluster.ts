/**
 * Facade for auto-provisioned cluster ops.
 * Implementations live under `./providers` (ManagedClusterProvider).
 */
import {
  getManagedClusterProvider,
  resolveActiveManagedProvider,
} from "./providers"
import type {
  AddManagedNodeInput,
  AddManagedNodeResult,
  CreateManagedClusterInput,
  CreateManagedClusterResult,
  RemoveManagedNodeInput,
  RemoveManagedNodeResult,
} from "./providers"

export async function createHetznerK3sCluster(
  input: CreateManagedClusterInput,
): Promise<CreateManagedClusterResult> {
  return getManagedClusterProvider("hetzner").create(input)
}

export async function addHetznerK3sWorker(
  input: AddManagedNodeInput,
): Promise<AddManagedNodeResult> {
  const provider = await resolveActiveManagedProvider()
  if (!provider) {
    throw new Error(
      "No managed cluster provider for the connected cluster. " +
        "Add workers only on Hetzner-created clusters.",
    )
  }
  if (!(await provider.isConfigured())) {
    throw new Error(
      `Managed provider "${provider.id}" is not configured on this control plane.`,
    )
  }
  return provider.addNode(input)
}

export async function removeManagedClusterNode(
  input: RemoveManagedNodeInput,
): Promise<RemoveManagedNodeResult> {
  const provider = await resolveActiveManagedProvider()
  if (!provider) {
    throw new Error(
      "No managed cluster provider. Node removal is only available for auto-provisioned clusters.",
    )
  }
  return provider.removeNode(input)
}

export async function clusterHasPendingBootstrap(): Promise<boolean> {
  const { getClusterRow } = await import("./cluster-store")
  const row = await getClusterRow()
  return Boolean(row?.bootstrapTokenHash)
}
