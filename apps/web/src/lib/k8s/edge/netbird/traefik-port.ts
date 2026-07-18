import { apiClients, loadKubeConfig } from "@/lib/k8s/client"

import {
  NETBIRD_NAMESPACE,
  TRAEFIK_ORIGIN_DS_NAME,
  TRAEFIK_ORIGIN_PORT,
} from "./agent-manifest"

/**
 * Port on the k3s node that NetBird peer targets should use.
 * Prefer Hostrig's host-network origin proxy on :80 (reachable over mesh);
 * fall back to Traefik Service nodePort.
 */
export async function resolveTraefikPeerPort(
  kubeconfigYaml: string,
): Promise<{ port: number; origin: string }> {
  const { core, apps } = apiClients(loadKubeConfig(kubeconfigYaml))

  try {
    const ds = await apps.readNamespacedDaemonSet({
      name: TRAEFIK_ORIGIN_DS_NAME,
      namespace: NETBIRD_NAMESPACE,
    })
    if ((ds.status?.numberReady ?? 0) > 0) {
      return {
        port: TRAEFIK_ORIGIN_PORT,
        origin: `http://127.0.0.1:${TRAEFIK_ORIGIN_PORT}`,
      }
    }
  } catch {
    // origin proxy not installed yet
  }

  let svc:
    | {
        spec?: {
          ports?: Array<{
            name?: string
            port?: number
            nodePort?: number
            targetPort?: unknown
          }>
          type?: string
        }
      }
    | undefined

  try {
    const list = await core.listNamespacedService({ namespace: "kube-system" })
    svc = (list.items ?? []).find((s) =>
      (s.metadata?.name ?? "").toLowerCase().includes("traefik"),
    )
  } catch {
    // ignore
  }
  if (!svc) {
    const all = await core.listServiceForAllNamespaces()
    svc = (all.items ?? []).find((s) =>
      (s.metadata?.name ?? "").toLowerCase().includes("traefik"),
    )
  }

  const webPort = svc?.spec?.ports?.find(
    (p) => p.name === "web" || p.port === 80,
  )
  const nodePort = webPort?.nodePort

  if (nodePort && nodePort > 0) {
    return {
      port: nodePort,
      origin: `http://127.0.0.1:${nodePort}`,
    }
  }

  return {
    port: TRAEFIK_ORIGIN_PORT,
    origin: `http://127.0.0.1:${TRAEFIK_ORIGIN_PORT}`,
  }
}
