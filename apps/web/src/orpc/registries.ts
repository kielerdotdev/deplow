import { ORPCError } from "@orpc/server"
import {
  createRegistryInputSchema,
  deleteRegistryInputSchema,
  setDefaultBuildRegistryInputSchema,
  updateRegistryInputSchema,
} from "@deplow/shared"

import { assertInstanceAdmin } from "@/lib/access"
import { requireConnectedKubeconfig } from "@/lib/k8s/cluster-store"
import { syncRegistrySecretsToCluster } from "@/lib/k8s/build"
import {
  createRegistry,
  deleteRegistry,
  listRegistries,
  setDefaultBuildRegistry,
  updateRegistry,
} from "@/lib/registries"

import { authedProcedure } from "./middleware"

export const list = authedProcedure.handler(async ({ context }) => {
  await assertInstanceAdmin(context.session!)
  return listRegistries()
})

export const create = authedProcedure
  .input(createRegistryInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      return await createRegistry(input)
    } catch (e) {
      throw new ORPCError("BAD_REQUEST", {
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

export const update = authedProcedure
  .input(updateRegistryInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      return await updateRegistry(input)
    } catch (e) {
      throw new ORPCError("BAD_REQUEST", {
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

export const remove = authedProcedure
  .input(deleteRegistryInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      await deleteRegistry(input.id)
      return { ok: true as const }
    } catch (e) {
      throw new ORPCError("BAD_REQUEST", {
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

export const setDefaultBuild = authedProcedure
  .input(setDefaultBuildRegistryInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      return await setDefaultBuildRegistry(input.id)
    } catch (e) {
      throw new ORPCError("BAD_REQUEST", {
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

/** Push dockerconfigjson secrets for all credentialed registries into every proj-* namespace. */
export const syncToCluster = authedProcedure.handler(async ({ context }) => {
  await assertInstanceAdmin(context.session!)
  try {
    const kubeconfigYaml = await requireConnectedKubeconfig()
    return await syncRegistrySecretsToCluster({ kubeconfigYaml })
  } catch (e) {
    throw new ORPCError("BAD_REQUEST", {
      message: e instanceof Error ? e.message : String(e),
    })
  }
})
