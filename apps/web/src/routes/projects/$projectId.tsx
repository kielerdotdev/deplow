import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import {
  BoxIcon,
  DatabaseBackupIcon,
  DatabaseIcon,
  HardDriveIcon,
  PlusIcon,
  RocketIcon,
  ScrollTextIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { AppShell } from "@/components/app-shell"
import { EmptyState } from "@/components/empty-state"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"

export const Route = createFileRoute("/projects/$projectId")({
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login" })
    const [project, deployments, backups] = await Promise.all([
      client.projects.get({ id: params.projectId }),
      client.deployments.list({ projectId: params.projectId }),
      client.projects.listBackups({ id: params.projectId }),
    ])
    return { session, project, deployments, backups }
  },
  component: ProjectPage,
})

function ProjectPage() {
  const { session, project, deployments, backups } = Route.useLoaderData()
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [deployServiceId, setDeployServiceId] = useState<string | null>(null)
  const [logs, setLogs] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [type, setType] = useState<"web" | "worker">("web")
  const [port, setPort] = useState(80)
  const [sourcePath, setSourcePath] = useState("")
  const [image, setImage] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedService = project.services.find(
    (service) => service.id === deployServiceId,
  )

  async function refresh() {
    await router.invalidate()
  }

  async function addService(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await client.services.create({
        projectId: project.id,
        name,
        type,
        containerPort: type === "web" ? port : 80,
      })
      setAddOpen(false)
      setName("")
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function deploy(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedService) return
    setPending(true)
    setError(null)
    try {
      await client.deployments.create({
        serviceId: selectedService.id,
        ...(sourcePath.trim()
          ? { sourcePath: sourcePath.trim() }
          : image.trim()
            ? { image: image.trim() }
            : { fromGit: true }),
        options: { containerPort: selectedService.containerPort },
      })
      setDeployServiceId(null)
      setSourcePath("")
      setImage("")
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function showLogs(serviceId: string) {
    setPending(true)
    setError(null)
    try {
      const result = await client.deployments.logs({ serviceId })
      setLogs(result.logs || "(no output)")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function runBackup() {
    setPending(true)
    try {
      await client.projects.backup({ id: project.id })
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function destroyProject() {
    if (!window.confirm(`Destroy ${project.name} and all linked resources?`))
      return
    setPending(true)
    try {
      await client.projects.destroy({ id: project.id })
      await router.navigate({ to: "/" })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPending(false)
    }
  }

  return (
    <AppShell
      user={session.user}
      title={project.name}
      description={`${project.services.length} service${project.services.length === 1 ? "" : "s"} · ${project.resourceLinks.length} linked resources`}
      actions={
        <>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add service
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => void destroyProject()}
          >
            <Trash2Icon data-icon="inline-start" />
            Destroy
          </Button>
        </>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Services</h2>
          <p className="text-xs text-muted-foreground">
            Independently deployable web processes and workers.
          </p>
        </div>
        {project.services.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {project.services.map((service) => {
              const latest = deployments.find(
                (deployment) => deployment.serviceId === service.id,
              )
              return (
                <Card key={service.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-muted p-2">
                          <BoxIcon className="size-4" />
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            {service.name}
                          </CardTitle>
                          <CardDescription>
                            {service.type === "worker"
                              ? "Worker"
                              : `${service.isPrimary ? "Primary web" : "Web"} · :${service.containerPort}`}
                          </CardDescription>
                        </div>
                      </div>
                      <StatusBadge status={latest?.status ?? service.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {service.publicUrl ? (
                      <a
                        className="block truncate font-mono text-xs hover:underline"
                        href={service.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {service.publicUrl}
                      </a>
                    ) : null}
                    {service.errorMessage ? (
                      <p className="text-xs text-destructive">
                        {service.errorMessage}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => setDeployServiceId(service.id)}
                      >
                        <RocketIcon data-icon="inline-start" />
                        Deploy
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending || !latest}
                        onClick={() => void showLogs(service.id)}
                      >
                        <ScrollTextIcon data-icon="inline-start" />
                        Logs
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={BoxIcon}
              title="No services"
              description="Add a web process or worker to this project."
              action={
                <Button onClick={() => setAddOpen(true)}>Add service</Button>
              }
            />
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Linked resources</h2>
          <p className="text-xs text-muted-foreground">
            Shared by every service and injected as environment variables.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {project.resourceLinks.map((link) => {
            const Icon =
              link.kind === "postgres"
                ? DatabaseIcon
                : link.kind === "redis"
                  ? WorkflowIcon
                  : HardDriveIcon
            return (
              <Card key={link.id}>
                <CardContent className="flex items-center justify-between gap-3 pt-5">
                  <div className="flex items-center gap-3">
                    <Icon className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium capitalize">
                        {link.kind}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {link.source}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={link.status} />
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project secrets</CardTitle>
            <CardDescription>
              Host-facing credentials assembled from linked resources.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64 rounded-lg border bg-muted/30">
              <pre className="p-4 font-mono text-xs whitespace-pre-wrap">
                {project.secretsYaml || "Resources are still provisioning."}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Postgres backups</CardTitle>
            <CardDescription>{backups.length} backup records</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => void runBackup()}
            >
              <DatabaseBackupIcon data-icon="inline-start" />
              Run backup
            </Button>
            {backups.slice(0, 5).map((backup) => (
              <div
                key={backup.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="truncate font-mono">{backup.storageKey}</span>
                <StatusBadge status={backup.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <ActionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add service"
        description="Create an independently deployable web process or worker."
        footer={
          <Button type="submit" form="add-service" disabled={pending || !name}>
            {pending ? "Creating…" : "Create service"}
          </Button>
        }
      >
        <form
          id="add-service"
          className="space-y-4"
          onSubmit={(e) => void addService(e)}
        >
          <div className="space-y-1.5">
            <Label htmlFor="service-name">Name</Label>
            <Input
              id="service-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="api"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={type === "web" ? "default" : "outline"}
                onClick={() => setType("web")}
              >
                Web
              </Button>
              <Button
                type="button"
                variant={type === "worker" ? "default" : "outline"}
                onClick={() => setType("worker")}
              >
                Worker
              </Button>
            </div>
          </div>
          {type === "web" ? (
            <div className="space-y-1.5">
              <Label htmlFor="service-port">Container port</Label>
              <Input
                id="service-port"
                type="number"
                value={port}
                onChange={(event) => setPort(Number(event.target.value))}
              />
            </div>
          ) : null}
        </form>
      </ActionDialog>

      <ActionDialog
        open={Boolean(selectedService)}
        onOpenChange={(open) => !open && setDeployServiceId(null)}
        title={`Deploy ${selectedService?.name ?? "service"}`}
        description="Use a source path, image, or the connected Git repository."
        footer={
          <Button type="submit" form="deploy-service" disabled={pending}>
            {pending ? "Queueing…" : "Deploy"}
          </Button>
        }
      >
        <form
          id="deploy-service"
          className="space-y-4"
          onSubmit={(e) => void deploy(e)}
        >
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
          {!sourcePath && !image ? (
            <p className="text-xs text-muted-foreground">
              With both fields empty, Deploy uses the service's connected Git
              repository.
            </p>
          ) : null}
        </form>
      </ActionDialog>

      <ActionDialog
        open={logs !== null}
        onOpenChange={(open) => !open && setLogs(null)}
        title="Runtime logs"
        description="Latest output from this service container."
      >
        <ScrollArea className="h-96 rounded-lg border bg-muted/30">
          <pre className="p-4 font-mono text-xs whitespace-pre-wrap">
            {logs}
          </pre>
        </ScrollArea>
      </ActionDialog>
    </AppShell>
  )
}
