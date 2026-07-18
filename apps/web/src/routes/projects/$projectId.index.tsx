import { useState } from "react"
import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router"
import { RocketIcon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { PageContent, PageHeader } from "@/components/page-layout"
import { ProjectTopology } from "@/components/project-topology"
import { ServiceDeleteDialog } from "@/components/service-delete-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useProjectUi } from "@/components/project-ui-context"
import { client } from "@/lib/orpc"

const projectRoute = getRouteApi("/projects/$projectId")

export const Route = createFileRoute("/projects/$projectId/")({
  component: ProjectOverviewPage,
})

function ProjectOverviewPage() {
  const { project, deployments } = projectRoute.useLoaderData()
  const { openAddService, setError } = useProjectUi()
  const router = useRouter()
  const [deployServiceId, setDeployServiceId] = useState<string | null>(null)
  const [deleteServiceId, setDeleteServiceId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const selectedService = project.services.find(
    (service) => service.id === deployServiceId,
  )
  const serviceToDelete = project.services.find(
    (service) => service.id === deleteServiceId,
  )

  const appCount = project.services.filter(
    (s) => s.type === "web" || s.type === "worker",
  ).length
  const resourceCount = project.services.filter(
    (s) => s.type === "postgres" || s.type === "redis",
  ).length

  async function refresh() {
    await router.invalidate()
  }

  async function addDataService(type: "postgres" | "redis") {
    setPending(true)
    setLocalError(null)
    try {
      const taken = project.services.some((s) => s.name === type)
      const name = taken
        ? `${type}-${Date.now().toString(36).slice(-4)}`
        : type
      const created = await client.services.create({
        projectId: project.id,
        name,
        type,
      })
      await refresh()
      void router.navigate({
        to: "/projects/$projectId/services/$serviceId",
        params: { projectId: project.id, serviceId: created.id },
      })
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function deployFromGit(serviceId: string) {
    const service = project.services.find((s) => s.id === serviceId)
    if (!service) return
    if (!service.git.connected) {
      setDeployServiceId(serviceId)
      return
    }
    setPending(true)
    setLocalError(null)
    try {
      const created = await client.deployments.create({
        serviceId,
        fromGit: true,
      })
      await refresh()
      void router.navigate({
        to: "/projects/$projectId/services/$serviceId/deployments/$deploymentId",
        params: {
          projectId: project.id,
          serviceId,
          deploymentId: created.id,
        },
        search: { view: "build-logs" },
      })
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function retryDeployment(deploymentId: string) {
    setPending(true)
    setLocalError(null)
    try {
      const created = await client.deployments.retry({ id: deploymentId })
      await refresh()
      void router.navigate({
        to: "/projects/$projectId/services/$serviceId/deployments/$deploymentId",
        params: {
          projectId: project.id,
          serviceId: created.serviceId,
          deploymentId: created.id,
        },
        search: { view: "build-logs" },
      })
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function cancelDeployment(deploymentId: string) {
    setPending(true)
    setLocalError(null)
    try {
      await client.deployments.stop({ id: deploymentId })
      await refresh()
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${appCount} service${appCount === 1 ? "" : "s"} · ${resourceCount} resource${resourceCount === 1 ? "" : "s"}`}
      />
      <PageContent width="flush">
        {localError ? (
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm text-destructive">{localError}</p>
          </div>
        ) : null}
        <ProjectTopology
          projectId={project.id}
          services={project.services}
          deployments={deployments}
          pending={pending}
          onAddService={openAddService}
          onAddResource={(type) => void addDataService(type)}
          onOpen={(serviceId) =>
            void router.navigate({
              to: "/projects/$projectId/services/$serviceId",
              params: {
                projectId: project.id,
                serviceId,
              },
            })
          }
          onDeploy={(serviceId) => void deployFromGit(serviceId)}
          onRetry={(deploymentId) => void retryDeployment(deploymentId)}
          onCancel={(deploymentId) => void cancelDeployment(deploymentId)}
          onViewDeployment={(serviceId, deploymentId) =>
            void router.navigate({
              to: "/projects/$projectId/services/$serviceId/deployments/$deploymentId",
              params: {
                projectId: project.id,
                serviceId,
                deploymentId,
              },
              search: { view: "summary" },
            })
          }
          onDelete={(serviceId) => setDeleteServiceId(serviceId)}
        />

        <DeployServiceDialog
          service={selectedService ?? null}
          onClose={() => setDeployServiceId(null)}
          onDeployed={refresh}
          onError={(msg) => {
            setLocalError(msg)
            setError(msg)
          }}
        />

        <ServiceDeleteDialog
          service={serviceToDelete ?? null}
          open={Boolean(serviceToDelete)}
          onOpenChange={(open) => !open && setDeleteServiceId(null)}
          pending={pending}
          onConfirm={async () => {
            if (!serviceToDelete) return
            setPending(true)
            setLocalError(null)
            try {
              await client.services.destroy({ id: serviceToDelete.id })
              setDeleteServiceId(null)
              await refresh()
            } catch (cause) {
              setLocalError(
                cause instanceof Error ? cause.message : String(cause),
              )
            } finally {
              setPending(false)
            }
          }}
        />
      </PageContent>
    </>
  )
}

function DeployServiceDialog({
  service,
  onClose,
  onDeployed,
  onError,
}: {
  service: { id: string; name: string; containerPort: number } | null
  onClose: () => void
  onDeployed: () => Promise<void>
  onError: (message: string | null) => void
}) {
  const [sourcePath, setSourcePath] = useState("")
  const [image, setImage] = useState("")
  const [pending, setPending] = useState(false)

  async function deploy(event: React.FormEvent) {
    event.preventDefault()
    if (!service) return
    setPending(true)
    onError(null)
    try {
      await client.deployments.create({
        serviceId: service.id,
        ...(sourcePath.trim()
          ? { sourcePath: sourcePath.trim() }
          : image.trim()
            ? { image: image.trim() }
            : { fromGit: true }),
      })
      onClose()
      await onDeployed()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <ActionDialog
      open={Boolean(service)}
      onOpenChange={(open) => !open && onClose()}
      title={service ? `Deploy ${service.name}` : "Deploy"}
      description="Deploy from Git, a source path, or a prebuilt image."
      icon={RocketIcon}
      footer={
        <Button type="submit" form="deploy-service" disabled={pending}>
          Deploy
        </Button>
      }
    >
      <form id="deploy-service" className="space-y-3" onSubmit={deploy}>
        <div className="space-y-1.5">
          <Label htmlFor="source-path">Source path</Label>
          <Input
            id="source-path"
            value={sourcePath}
            onChange={(event) => setSourcePath(event.target.value)}
            placeholder="/absolute/path/to/service"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="image">Or container image</Label>
          <Input
            id="image"
            value={image}
            onChange={(event) => setImage(event.target.value)}
            placeholder="ghcr.io/you/service:latest"
          />
        </div>
      </form>
    </ActionDialog>
  )
}
