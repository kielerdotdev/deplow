import {
  apiClients,
  decryptKubeconfig,
  loadKubeConfig,
} from "../client"
import {
  getClusterRow,
  requireConnectedKubeconfig,
} from "../cluster-store"

export function sanitizeClusterName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63)
}

export async function readStoredKubeconfig(): Promise<string> {
  const row = await getClusterRow()
  if (!row?.kubeconfigEncrypted) {
    throw new Error(
      "No kubeconfig stored. Connect or create a cluster under Settings → Cluster.",
    )
  }
  return decryptKubeconfig(row.kubeconfigEncrypted)
}

/** Delete a node object from the API (best-effort after cloud destroy). */
export async function deleteKubernetesNode(nodeName: string): Promise<void> {
  const yaml = await requireConnectedKubeconfig().catch(async () =>
    readStoredKubeconfig(),
  )
  const { core } = apiClients(loadKubeConfig(yaml))
  try {
    await core.deleteNode({ name: nodeName })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/not found|404/i.test(msg)) return
    throw e
  }
}

export async function assertWorkerNode(nodeName: string): Promise<void> {
  const yaml = await readStoredKubeconfig()
  const { core } = apiClients(loadKubeConfig(yaml))
  let node
  try {
    node = await core.readNode({ name: nodeName })
  } catch {
    throw new Error(`Kubernetes node "${nodeName}" not found.`)
  }
  const labels = (node.metadata?.labels ?? {}) as Record<string, string>
  const roles = Object.keys(labels)
    .filter((k) => k.startsWith("node-role.kubernetes.io/"))
    .map((k) => k.replace("node-role.kubernetes.io/", ""))
  if (roles.includes("control-plane") || roles.includes("master")) {
    throw new Error(
      `Refusing to remove control-plane node "${nodeName}". Remove workers only.`,
    )
  }
}
