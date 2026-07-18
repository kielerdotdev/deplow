/**
 * Service lifetime orchestration — the only happy-path mutator of services.status.
 */

export {
  canTransitionServiceStatus,
  IllegalServiceTransitionError,
  transitionService,
  transitionServiceBestEffort,
  type ServiceStatus,
  type TransitionPatch,
} from "./transition"
export { buildServiceDeployEnv, loadObserveDeployEnv } from "./env"
export {
  deployService,
  ServiceLifecycleError,
  type DeployServiceInput,
} from "./deploy"
export { stopService } from "./stop"
export { destroyServiceLifecycle } from "./destroy"
export { createService, type CreateServiceInput } from "./create"
export {
  attachGitOnCreate,
  connectServiceGit,
  disconnectServiceGit,
} from "./git"
export {
  markServiceDeployFailed,
  markServiceDeploySucceeded,
  markServiceProvisionFailed,
  markServiceProvisionSucceeded,
  markServiceProvisioning,
} from "./completion"
export { reconcileStuckServices } from "./reconcile"

import { createService } from "./create"
import { deployService, type DeployServiceInput } from "./deploy"
import { destroyServiceLifecycle } from "./destroy"
import { attachGitOnCreate, connectServiceGit, disconnectServiceGit } from "./git"
import { stopService } from "./stop"

/** Facade object for ORPC / project-destroy call sites. */
export const serviceLifecycle = {
  create: createService,
  deploy: deployService,
  stop: stopService,
  destroy: destroyServiceLifecycle,
  connectGit: connectServiceGit,
  disconnectGit: disconnectServiceGit,
  attachGitOnCreate,
  async createAndDeploy(input: {
    create: Parameters<typeof createService>[0]
    git?: Omit<Parameters<typeof attachGitOnCreate>[0], "serviceId">
    deploy?: DeployServiceInput & { image?: string }
  }) {
    const created = await createService(input.create)
    let webhook: Awaited<ReturnType<typeof attachGitOnCreate>> | null = null
    try {
      if (input.git) {
        webhook = await attachGitOnCreate({
          ...input.git,
          serviceId: created.serviceId,
        })
      }
    } catch (e) {
      // Compensate half-wired create — do not leave orphan rows after git attach fail.
      await destroyServiceLifecycle({
        serviceId: created.serviceId,
        force: true,
        userId: input.git?.userId,
      }).catch(() => undefined)
      throw e
    }
    let deployment: Awaited<ReturnType<typeof deployService>> | null = null
    const image = input.deploy?.image ?? input.deploy?.options?.image
    if (image?.trim()) {
      deployment = await deployService({
        ...input.deploy!,
        serviceId: created.serviceId,
        image: image.trim(),
      })
    }
    return { serviceId: created.serviceId, webhook, deployment }
  },
}
