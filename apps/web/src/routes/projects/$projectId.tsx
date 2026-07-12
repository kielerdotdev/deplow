import { useEffect, useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import {
  BoxIcon,
  DatabaseIcon,
  HardDriveIcon,
  PlusIcon,
  RocketIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react"
import { z } from "zod"

import { ActionDialog } from "@/components/action-dialog"
import { AddServiceDialog } from "@/components/add-service-dialog"
import { AppShell } from "@/components/app-shell"
import { CommandAction } from "@/components/command-action"
import { EmptyState } from "@/components/empty-state"
import { PageSection } from "@/components/page-section"
import { ProjectRail, type ProjectSection } from "@/components/project-rail"
import { ServiceCard } from "@/components/service-card"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getSession } from "@/lib/auth.functions"
import {
  parseProjectSection,
  PROJECT_SECTION_IDS,
} from "@/lib/command"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

const projectSearchSchema = z.object({
  section: z.enum(PROJECT_SECTION_IDS).optional().catch("overview"),
})

export const Route = createFileRoute("/projects/$projectId")({
  validateSearch: (search) => projectSearchSchema.parse(search),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login", search: { redirect: undefined } })
    const [shell, project, deployments] = await Promise.all([
      loadShellContext(),
      client.projects.get({ id: params.projectId }),
      client.deployments.list({ projectId: params.projectId }),
    ])
    return { session, shell, project, deployments }
  },
  component: ProjectPage,
})

function ProjectPage() {
  const { session, shell, project, deployments } = Route.useLoaderData()
  const { section: sectionParam } = Route.useSearch()
  const section = parseProjectSection(sectionParam)
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [deployServiceId, setDeployServiceId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedService = project.services.find(
    (service) => service.id === deployServiceId,
  )

  function setSection(next: ProjectSection) {
    void router.navigate({
      to: "/projects/$projectId",
      params: { projectId: project.id },
      search: { section: next },
      replace: true,
    })
  }

  async function refresh() {
    await router.invalidate()
  }

  async function addDataService(type: "postgres" | "redis") {
    setPending(true)
    setError(null)
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
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      title={project.name}
      description={`${project.services.length} service${project.services.length === 1 ? "" : "s"}`}
      actions={
        <>
          <CommandAction
            id={`project.${project.id}.add-service`}
            label="Add service"
            keywords={["add", "service", "create"]}
            icon={PlusIcon}
            onSelect={() => setAddOpen(true)}
          />
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add service
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              void (async () => {
                if (
                  !window.confirm(
                    `Destroy ${project.name}? Type confirmation is also available in Settings.`,
                  )
                )
                  return
                setPending(true)
                try {
                  await client.projects.destroy({ id: project.id })
                  void router.navigate({ to: "/" })
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : String(cause),
                  )
                  setPending(false)
                }
              })()
            }
          >
            <Trash2Icon data-icon="inline-start" />
            Destroy
          </Button>
        </>
      }
    >
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {project.services.map((service) => (
        <CommandAction
          key={service.id}
          id={`project.${project.id}.open.${service.id}`}
          label={`Open ${service.name}`}
          keywords={["service", "open", service.name]}
          icon={BoxIcon}
          onSelect={() =>
            void router.navigate({
              to: "/projects/$projectId/services/$serviceId",
              params: { projectId: project.id, serviceId: service.id },
            })
          }
        />
      ))}

      {project.services
        .filter((s) => s.type === "web" || s.type === "worker")
        .map((service) => (
          <CommandAction
            key={`deploy-${service.id}`}
            id={`project.${project.id}.deploy.${service.id}`}
            label={`Deploy ${service.name}`}
            keywords={["deploy", "release", service.name]}
            icon={RocketIcon}
            onSelect={() => setDeployServiceId(service.id)}
          />
        ))}

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <ProjectRail value={section} onChange={setSection} />

        <div className="min-w-0 flex-1 space-y-6">
          {section === "overview" ? (
            <>
              <PageSection
                icon={BoxIcon}
                title="Services"
                description="Each service has its own page, lifecycle, and configuration."
              >
                {project.services.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {project.services.map((service) => {
                      const latest = deployments.find(
                        (deployment) => deployment.serviceId === service.id,
                      )
                      const isApp =
                        service.type === "web" || service.type === "worker"
                      return (
                        <ServiceCard
                          key={service.id}
                          projectId={project.id}
                          serviceId={service.id}
                          name={service.name}
                          type={service.type}
                          isPrimary={service.isPrimary}
                          containerPort={service.containerPort}
                          status={latest?.status ?? service.status}
                          publicUrl={service.publicUrl}
                          errorMessage={service.errorMessage}
                          pending={pending}
                          hasDeployment={Boolean(latest)}
                          onDeploy={
                            isApp
                              ? () => setDeployServiceId(service.id)
                              : undefined
                          }
                          onLogs={
                            isApp
                              ? () =>
                                  void router.navigate({
                                    to: "/projects/$projectId/services/$serviceId",
                                    params: {
                                      projectId: project.id,
                                      serviceId: service.id,
                                    },
                                    search: { tab: "logs" },
                                  })
                              : undefined
                          }
                        />
                      )
                    })}
                  </div>
                ) : (
                  <div className="surface-panel overflow-hidden">
                    <EmptyState
                      icon={BoxIcon}
                      title="No services"
                      description="Add a web app, worker, Postgres, or Redis service."
                      action={
                        <Button onClick={() => setAddOpen(true)}>
                          Add service
                        </Button>
                      }
                    />
                  </div>
                )}
              </PageSection>

              <PageSection
                icon={DatabaseIcon}
                title="Data services"
                description="Postgres and Redis are first-class services. Bind them explicitly to apps."
              >
                <div className="mb-3 flex flex-wrap gap-2">
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
                <div className="grid gap-3 sm:grid-cols-3">
                  {project.resourceLinks.length === 0 ? (
                    <p className="text-sm text-muted-foreground sm:col-span-3">
                      No data services yet.
                    </p>
                  ) : (
                    project.resourceLinks.map((link) => {
                      const Icon =
                        link.kind === "postgres"
                          ? DatabaseIcon
                          : link.kind === "redis"
                            ? WorkflowIcon
                            : HardDriveIcon
                      return (
                        <button
                          key={link.id}
                          type="button"
                          className="surface-panel flex items-center justify-between gap-3 p-4 text-left hover:bg-muted/40"
                          onClick={() =>
                            void router.navigate({
                              to: "/projects/$projectId/services/$serviceId",
                              params: {
                                projectId: project.id,
                                serviceId: link.id,
                              },
                            })
                          }
                        >
                          <div className="flex items-center gap-3">
                            <div className="icon-well size-9">
                              <Icon className="size-4" />
                            </div>
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
                        </button>
                      )
                    })
                  )}
                </div>
              </PageSection>
            </>
          ) : null}

          {section === "deployments" ? (
            <div className="surface-panel divide-y divide-border">
              {deployments.length === 0 ? (
                <p className="px-4 py-8 text-sm text-muted-foreground">
                  No deployments yet
                </p>
              ) : (
                deployments.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30"
                    onClick={() =>
                      void router.navigate({
                        to: "/projects/$projectId/services/$serviceId",
                        params: {
                          projectId: project.id,
                          serviceId: d.serviceId,
                        },
                        search: { tab: "deployments" },
                      })
                    }
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {d.serviceName}
                        {"gitSha" in d && d.gitSha ? (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {String(d.gitSha).slice(0, 7)}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.createdAt}
                        {d.errorMessage ? ` · ${d.errorMessage}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={d.status} />
                  </button>
                ))
              )}
            </div>
          ) : null}

          {section === "logs" ? (
            <div className="surface-panel p-4">
              <p className="text-sm text-muted-foreground">
                Logs are scoped to each service. Open a service and use its Logs
                tab.
              </p>
            </div>
          ) : null}

          {section === "secrets" ? (
            <SecretsPanel projectId={project.id} />
          ) : null}

          {section === "settings" ? (
            <ProjectSettingsPanel
              project={project}
              onError={setError}
              pending={pending}
              setPending={setPending}
            />
          ) : null}
        </div>
      </div>

      <AddServiceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={project.id}
        onCreated={async (serviceId) => {
          await refresh()
          if (serviceId) {
            void router.navigate({
              to: "/projects/$projectId/services/$serviceId",
              params: { projectId: project.id, serviceId },
            })
          }
        }}
        onError={setError}
      />

      <DeployServiceDialog
        service={selectedService ?? null}
        onClose={() => setDeployServiceId(null)}
        onDeployed={refresh}
        onError={setError}
      />
    </AppShell>
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

function SecretsPanel({ projectId }: { projectId: string }) {
  const [masked, setMasked] = useState(true)
  const [yaml, setYaml] = useState("")
  const [loading, setLoading] = useState(true)

  async function load(reveal: boolean) {
    setLoading(true)
    try {
      const result = await client.projects.secrets({ id: projectId, reveal })
      setYaml(
        result.secretsYaml ||
          "No credentials yet. Add Postgres/Redis first.",
      )
      setMasked(result.masked)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(false)
  }, [projectId])

  return (
    <div className="surface-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Connection secrets</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Masked by default. Reveal is audited on the server.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void load(masked)}
        >
          {masked ? "Reveal" : "Mask"}
        </Button>
      </div>
      <ScrollArea className="h-64 rounded-lg border border-border bg-muted/20">
        <pre className="p-4 font-mono text-xs whitespace-pre-wrap">
          {loading ? "Loading…" : yaml}
        </pre>
      </ScrollArea>
    </div>
  )
}

function ProjectSettingsPanel({
  project,
  onError,
  pending,
  setPending,
}: {
  project: {
    id: string
    name: string
    slug: string
    backupIntervalMs: number
    nodeId: string | null
  }
  onError: (message: string | null) => void
  pending: boolean
  setPending: (v: boolean) => void
}) {
  const router = useRouter()
  const [destroyOpen, setDestroyOpen] = useState(false)
  const [confirm, setConfirm] = useState("")

  return (
    <div className="space-y-6">
      <div className="surface-panel space-y-3 p-5 text-sm">
        <h3 className="font-semibold">Project</h3>
        <p>
          <span className="text-muted-foreground">Name:</span> {project.name}
        </p>
        <p>
          <span className="text-muted-foreground">Slug:</span>{" "}
          <span className="font-mono">{project.slug}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Backup interval:</span>{" "}
          {Math.round(project.backupIntervalMs / 3_600_000)}h
        </p>
        <p>
          <span className="text-muted-foreground">Node:</span>{" "}
          {project.nodeId ?? "unassigned"}
        </p>
      </div>
      <div className="surface-panel space-y-3 p-5">
        <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
        <p className="text-xs text-muted-foreground">
          Destroying a project removes all services, data containers, and
          backups for this project.
        </p>
        <Button variant="destructive" onClick={() => setDestroyOpen(true)}>
          Destroy project
        </Button>
      </div>
      <ActionDialog
        open={destroyOpen}
        onOpenChange={setDestroyOpen}
        title="Destroy project"
        description={`Type ${project.name} to confirm.`}
        icon={Trash2Icon}
        footer={
          <Button
            variant="destructive"
            disabled={confirm !== project.name || pending}
            onClick={() =>
              void (async () => {
                setPending(true)
                onError(null)
                try {
                  await client.projects.destroy({ id: project.id })
                  void router.navigate({ to: "/" })
                } catch (cause) {
                  onError(
                    cause instanceof Error ? cause.message : String(cause),
                  )
                  setPending(false)
                }
              })()
            }
          >
            Destroy
          </Button>
        }
      >
        <div className="space-y-2">
          <Label>Project name</Label>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={project.name}
          />
        </div>
      </ActionDialog>
    </div>
  )
}
