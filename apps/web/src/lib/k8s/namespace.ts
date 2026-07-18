import type { V1LimitRange, V1Namespace } from "@kubernetes/client-node"

import type { apiClients } from "./client"
import { ensureProjectNetworkPolicy } from "./network-policy"

type CoreApi = ReturnType<typeof apiClients>["core"]
type NetworkingApi = ReturnType<typeof apiClients>["networking"]

/** PSS: warn/audit restricted (enforce baseline) so Postgres/Redis can still schedule. */
const NAMESPACE_LABELS: Record<string, string> = {
  "app.kubernetes.io/managed-by": "hostrig",
  "pod-security.kubernetes.io/enforce": "baseline",
  "pod-security.kubernetes.io/audit": "restricted",
  "pod-security.kubernetes.io/warn": "restricted",
}

const LIMIT_RANGE_NAME = "hostrig-defaults"

function buildLimitRange(namespace: string): V1LimitRange {
  return {
    metadata: {
      name: LIMIT_RANGE_NAME,
      namespace,
      labels: { "app.kubernetes.io/managed-by": "hostrig" },
    },
    spec: {
      limits: [
        {
          type: "Container",
          defaultRequest: {
            cpu: "100m",
            memory: "128Mi",
          },
          // client-node maps _default → JSON "default"
          _default: {
            cpu: "1",
            memory: "512Mi",
          },
          max: {
            cpu: "4",
            memory: "4Gi",
          },
        },
      ],
    },
  }
}

async function ensureLimitRange(core: CoreApi, namespace: string): Promise<void> {
  const body = buildLimitRange(namespace)
  try {
    await core.readNamespacedLimitRange({ name: LIMIT_RANGE_NAME, namespace })
    await core.replaceNamespacedLimitRange({
      name: LIMIT_RANGE_NAME,
      namespace,
      body,
    })
  } catch {
    await core.createNamespacedLimitRange({ namespace, body })
  }
}

async function patchNamespaceLabels(
  core: CoreApi,
  ns: string,
  existing: V1Namespace,
): Promise<void> {
  const labels = { ...(existing.metadata?.labels ?? {}), ...NAMESPACE_LABELS }
  const needsUpdate = Object.entries(NAMESPACE_LABELS).some(
    ([k, v]) => existing.metadata?.labels?.[k] !== v,
  )
  if (!needsUpdate) return
  await core.replaceNamespace({
    name: ns,
    body: {
      ...existing,
      metadata: {
        ...existing.metadata,
        name: ns,
        labels,
      },
    },
  })
}

/**
 * Ensure project namespace exists with PSS labels, LimitRange, and NetworkPolicy.
 */
export async function ensureProjectNamespace(
  core: CoreApi,
  networking: NetworkingApi,
  ns: string,
): Promise<void> {
  try {
    const existing = await core.readNamespace({ name: ns })
    await patchNamespaceLabels(core, ns, existing)
  } catch {
    await core.createNamespace({
      body: {
        metadata: {
          name: ns,
          labels: { ...NAMESPACE_LABELS },
        },
      },
    })
  }

  await ensureLimitRange(core, ns)
  await ensureProjectNetworkPolicy(networking, ns)
}
