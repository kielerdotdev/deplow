import type { V1RuntimeClass } from "@kubernetes/client-node"

import type { apiClients } from "./client"
import { resolveRuntimeClassName } from "./user-app-pod"

type NodeApi = ReturnType<typeof apiClients>["node"]

export const GVISOR_RUNTIME_CLASS = "gvisor"
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
      `gVisor RuntimeClass "${GVISOR_RUNTIME_CLASS}" (handler ${GVISOR_HANDLER}) is not available on the cluster. Install runsc on every k3s node and configure containerd (see docs/secure-runtime.md / scripts/install-gvisor-k3s.sh), then redeploy. Escape hatch: DEPLOW_APP_RUNTIME=runc.`,
    )
  }
  return new Error(
    `RuntimeClass "${runtimeClassName}" is not available on the cluster. Install it on nodes or set DEPLOW_APP_RUNTIME=runc temporarily.`,
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
 * Creates the RuntimeClass if missing when we can; fails if required and absent.
 */
export async function ensureAppRuntimeClass(input: {
  node: NodeApi
  appRuntime: string
  required: boolean
}): Promise<string | undefined> {
  const className = resolveRuntimeClassName(input.appRuntime)
  if (!className) return undefined

  if (className === GVISOR_RUNTIME_CLASS) {
    try {
      await ensureGvisorRuntimeClass(input.node)
      return className
    } catch (e) {
      if (input.required) {
        const detail = e instanceof Error ? e.message : String(e)
        throw new Error(
          `${missingRuntimeClassError(className).message} (${detail})`,
          { cause: e },
        )
      }
      return undefined
    }
  }

  try {
    await input.node.readRuntimeClass({ name: className })
    return className
  } catch {
    if (input.required) throw missingRuntimeClassError(className)
    return undefined
  }
}
