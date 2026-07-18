import type { V1RuntimeClass } from "@kubernetes/client-node"

import type { apiClients } from "./client"
import { USER_APP_RUNTIME_CLASS } from "./user-app-pod"

type NodeApi = ReturnType<typeof apiClients>["node"]

export const GVISOR_RUNTIME_CLASS = USER_APP_RUNTIME_CLASS
export const GVISOR_HANDLER = "runsc"

export function buildGvisorRuntimeClass(): V1RuntimeClass {
  return {
    apiVersion: "node.k8s.io/v1",
    kind: "RuntimeClass",
    metadata: {
      name: GVISOR_RUNTIME_CLASS,
      labels: { "app.kubernetes.io/managed-by": "hostrig" },
    },
    handler: GVISOR_HANDLER,
  }
}

export function missingRuntimeClassError(runtimeClassName: string): Error {
  if (runtimeClassName === GVISOR_RUNTIME_CLASS) {
    return new Error(
      `gVisor RuntimeClass "${GVISOR_RUNTIME_CLASS}" (handler ${GVISOR_HANDLER}) is not available on the cluster. ` +
        `Install runsc on every k3s node and configure containerd (see docs/secure-runtime.md / scripts/install-gvisor-k3s.sh), then redeploy. ` +
        `User apps cannot run without gVisor — there is no runc escape hatch.`,
    )
  }
  return new Error(
    `RuntimeClass "${runtimeClassName}" is not available on the cluster.`,
  )
}

/** Ensure the gvisor RuntimeClass object exists (nodes must still have the handler). */
export async function ensureGvisorRuntimeClass(node: NodeApi): Promise<void> {
  const body = buildGvisorRuntimeClass()
  try {
    await node.readRuntimeClass({ name: GVISOR_RUNTIME_CLASS })
  } catch {
    await node.createRuntimeClass({ body })
  }
}

/**
 * Preflight before scheduling user apps under gVisor.
 * Always ensures RuntimeClass gvisor; fails hard if it cannot be created.
 * There is no runc fallback for user apps.
 */
export async function ensureAppRuntimeClass(input: {
  node: NodeApi
  /** @deprecated ignored — always gvisor */
  appRuntime?: string
  /** @deprecated ignored — always required */
  required?: boolean
}): Promise<string> {
  try {
    await ensureGvisorRuntimeClass(input.node)
    return GVISOR_RUNTIME_CLASS
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new Error(
      `${missingRuntimeClassError(GVISOR_RUNTIME_CLASS).message} (${detail})`,
      { cause: e },
    )
  }
}
