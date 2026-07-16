import { useState } from "react"
import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router"
import { BoxIcon, RocketIcon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { EmptyState } from "@/components/empty-state"
import { PageContent } from "@/components/page-layout"
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

  return (
    <PageContent width="wide">
      {localError ? (
        <p className="mb-4 text-sm text-destructive">{localError}</p>
      ) : null}
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-[-0.03em]">
              {project.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {project.services.length} service
              {project.services.length === 1 ? "" : "s"} — apps, Data services,
              explicit bindings
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void addDataService("postgres")}
            >
              Add Postgres
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void addDataService("redis")}
            >
              Add Redis
            </Button>
          </div>
        </div>

        {project.services.length ? (
          <ProjectTopology
            projectId={project.id}
            services={project.services}
            deployments={deployments}
            pending={pending}
            onAddService={openAddService}
            onOpen={(serviceId) =>
              void router.navigate({
                to: "/projects/$projectId/services/$serviceId",
                params: {
                  projectId: project.id,
                  serviceId,
                },
              })
            }
            onDeploy={(serviceId) => setDeployServiceId(serviceId)}
            onLogs={(serviceId) =>
              void router.navigate({
                to: "/projects/$projectId/services/$serviceId",
                params: {
                  projectId: project.id,
                  serviceId,
                },
                search: { tab: "logs" },
              })
            }
            onDelete={(serviceId) => setDeleteServiceId(serviceId)}
          />
        ) : (
          <div className="surface-panel overflow-hidden">
            <EmptyState
              icon={BoxIcon}
              title="No services"
              description="Add a web app, worker, Postgres, or Redis service."
              action={
                <Button onClick={openAddService}>Add service</Button>
              }
            />
          </div>
        )}
      </div>

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
