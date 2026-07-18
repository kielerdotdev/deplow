import { ORPCError } from "@orpc/server"
import {
  addClusterNodeInputSchema,
  connectClusterInputSchema,
  createHetznerClusterInputSchema,
  removeClusterNodeInputSchema,
  storeClusterJoinTokenInputSchema,
  workerJoinScriptInputSchema,
} from "@hostrig/shared"

import { assertInstanceAdmin, isInstanceAdmin } from "@/lib/access"
import {
  connectByoKubeconfig,
  disconnectCluster,
  getClusterSummary,
  getStoredKubeconfigYaml,
  getWorkerJoinScript as loadWorkerJoinScript,
  redactClusterSummaryForMember,
  storeNodeJoinToken,
} from "@/lib/k8s/cluster-store"
import {
  addHetznerK3sWorker,
  createHetznerK3sCluster,
  removeManagedClusterNode,
} from "@/lib/k8s/spawn-cluster"

import { authedProcedure, writeProcedure } from "./middleware"

/** Any signed-in user may see readiness; infra recon is instance-admin only. */
export const get = authedProcedure.handler(async ({ context }) => {
  const summary = await getClusterSummary()
  const admin = await isInstanceAdmin(context.session!.user.id)
  return admin ? summary : redactClusterSummaryForMember(summary)
})

export const connect = writeProcedure
  .input(connectClusterInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      return await connectByoKubeconfig(input)
    } catch (e) {
      throw new ORPCError("BAD_REQUEST", {
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

export const disconnect = writeProcedure.handler(async ({ context }) => {
  await assertInstanceAdmin(context.session!)
  try {
    return await disconnectCluster()
  } catch (e) {
    throw new ORPCError("BAD_REQUEST", {
      message: e instanceof Error ? e.message : String(e),
    })
  }
})

export const createHetzner = writeProcedure
  .input(createHetznerClusterInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      const created = await createHetznerK3sCluster(input)
      const summary = await getClusterSummary()
      return { ...summary, ...created }
    } catch (e) {
      throw new ORPCError("BAD_REQUEST", {
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

export const addNode = writeProcedure
  .input(addClusterNodeInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      const created = await addHetznerK3sWorker(input)
      const summary = await getClusterSummary()
      return { ...summary, ...created }
    } catch (e) {
      throw new ORPCError("BAD_REQUEST", {
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

export const removeNode = writeProcedure
  .input(removeClusterNodeInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      const removed = await removeManagedClusterNode(input)
      const summary = await getClusterSummary()
      return { ...summary, ...removed }
    } catch (e) {
      throw new ORPCError("BAD_REQUEST", {
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

/** Admin-only: reveal stored kubeconfig YAML. */
export const getKubeconfig = writeProcedure.handler(async ({ context }) => {
  await assertInstanceAdmin(context.session!)
  try {
    return await getStoredKubeconfigYaml()
  } catch (e) {
    throw new ORPCError("BAD_REQUEST", {
      message: e instanceof Error ? e.message : String(e),
    })
  }
})

/** Self-hosted worker: gVisor install + k3s agent join script. */
export const getWorkerJoinScript = writeProcedure
  .input(workerJoinScriptInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      return await loadWorkerJoinScript(input)
    } catch (e) {
      throw new ORPCError("BAD_REQUEST", {
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

/** Store k3s node-token for BYO clusters (enables self-hosted join script). */
export const storeJoinToken = writeProcedure
  .input(storeClusterJoinTokenInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      await storeNodeJoinToken(input.nodeToken.trim())
      return { ok: true as const }
    } catch (e) {
      throw new ORPCError("BAD_REQUEST", {
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })
