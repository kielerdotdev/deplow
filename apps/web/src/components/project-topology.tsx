import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import {
  ChevronRightIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  GlobeIcon,
  PlusIcon,
  RocketIcon,
  RotateCcwIcon,
  Trash2Icon,
  WorkflowIcon,
  BoxIcon,
} from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  deploymentStatusLabel,
  isDeploymentInProgress,
  resolveDeployPrimaryAction,
  resolveServiceDisplayStatus,
  shortSha,
} from "@/lib/service/deployment-status"
import { formatRelativeTime } from "@/lib/ui-format"
import { cn } from "@/lib/utils"

type Service = {
  id: string
  name: string
  type: "web" | "worker" | "postgres" | "redis"
  status: string
  publicUrl?: string | null
  errorMessage?: string | null
  git?: { connected: boolean }
}

type Deployment = {
  id: string
  serviceId: string
  status: string
  gitSha?: string | null
  gitBranch?: string | null
  triggeredBy?: string | null
  createdAt: string
}

type ProjectTopologyProps = {
  projectId: string
  services: Service[]
  deployments: Deployment[]
  pending?: boolean
  onAddService?: () => void
  onAddResource?: (type: "postgres" | "redis") => void
  onDeploy?: (serviceId: string) => void
  onRetry?: (deploymentId: string) => void
  onCancel?: (deploymentId: string) => void
  onViewDeployment?: (serviceId: string, deploymentId: string) => void
  onOpen?: (serviceId: string) => void
  onDelete?: (serviceId: string) => void
}

const typeMeta = {
  web: { label: "Web service", icon: GlobeIcon },
  worker: { label: "Worker", icon: BoxIcon },
  postgres: { label: "PostgreSQL", icon: DatabaseIcon },
  redis: { label: "Redis", icon: WorkflowIcon },
} as const

function SectionHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {action}
    </div>
  )
}

function AddResourceMenu({
  pending,
  onAddResource,
  label = "Add resource",
  variant = "outline" as const,
}: {
  pending?: boolean
  onAddResource?: (type: "postgres" | "redis") => void
  label?: string
  variant?: "outline" | "default"
}) {
  if (!onAddResource) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant={variant} disabled={pending}>
            <PlusIcon data-icon="inline-start" />
            {label}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onAddResource("postgres")}>
          <DatabaseIcon />
          PostgreSQL
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddResource("redis")}>
          <WorkflowIcon />
          Redis
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ServiceCard({
  projectId,
  service,
  latest,
  hasSuccessfulDeploy,
  pending,
  onDeploy,
  onRetry,
  onCancel,
  onViewDeployment,
  onOpen,
  onDelete,
}: {
  projectId: string
  service: Service
  latest?: Deployment | null
  hasSuccessfulDeploy: boolean
  pending?: boolean
  onDeploy?: () => void
  onRetry?: () => void
  onCancel?: () => void
  onViewDeployment?: () => void
  onOpen?: () => void
  onDelete?: () => void
}) {
  const meta = typeMeta[service.type]
  const isApp = service.type === "web" || service.type === "worker"
  const displayStatus = resolveServiceDisplayStatus({
    serviceStatus: service.status,
    hasSuccessfulDeploy,
  })
  const action = isApp
    ? resolveDeployPrimaryAction({
        gitConnected: Boolean(service.git?.connected),
        latest: latest ?? null,
      })
    : null
  const sha = latest ? shortSha(latest.gitSha) : null
  const deployLabel = latest
    ? `Deployment ${sha ?? latest.id.slice(0, 8)} ${deploymentStatusLabel[latest.status]?.toLowerCase() ?? latest.status} · ${formatRelativeTime(latest.createdAt)}`
    : null

  const card = (
    <article className="group relative surface-panel flex flex-col gap-3 p-5 transition-colors hover:bg-muted/30">
      <Link
        to="/projects/$projectId/services/$serviceId"
        params={{ projectId, serviceId: service.id }}
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Open ${service.name}`}
      />
      <div className="relative z-[1] flex items-start justify-between gap-3 pointer-events-none">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold tracking-tight">
              {service.name}
            </h4>
          </div>
          <p className="text-xs text-muted-foreground">{meta.label}</p>
        </div>
        <ChevronRightIcon
          className="size-4 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>

      <div className="relative z-[1] space-y-1.5 pointer-events-none">
        <StatusBadge status={displayStatus} context="service" />
        {isApp ? (
          service.publicUrl ? (
            <p className="truncate font-mono text-xs text-foreground/80">
              {service.publicUrl.replace(/^https?:\/\//, "")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No public URL</p>
          )
        ) : null}
        {deployLabel ? (
          <p className="text-xs text-muted-foreground" title={latest?.createdAt}>
            {deployLabel}
          </p>
        ) : isApp ? (
          <p className="text-xs text-muted-foreground">No deployments yet</p>
        ) : null}
        {service.errorMessage ? (
          <p className="line-clamp-1 text-xs text-destructive">
            {service.errorMessage}
          </p>
        ) : null}
      </div>

      {isApp && action ? (
        <div className="relative z-[1] flex flex-wrap gap-2 pointer-events-auto">
          <Button
            size="sm"
            variant={action.kind === "deploy" ? "default" : "outline"}
            disabled={pending}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (action.kind === "view") onViewDeployment?.()
              else if (action.kind === "retry") onRetry?.()
              else onDeploy?.()
            }}
          >
            {action.kind === "retry" ? (
              <RotateCcwIcon data-icon="inline-start" />
            ) : (
              <RocketIcon data-icon="inline-start" />
            )}
            {action.label}
          </Button>
          {action.kind === "view" &&
          latest &&
          isDeploymentInProgress(latest.status) &&
          onCancel ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCancel()
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger className="outline-none">{card}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={onOpen}
          render={
            onOpen ? undefined : (
              <Link
                to="/projects/$projectId/services/$serviceId"
                params={{ projectId, serviceId: service.id }}
              />
            )
          }
        >
          <ExternalLinkIcon />
          Open
        </ContextMenuItem>
        {isApp && onDeploy ? (
          <ContextMenuItem disabled={pending} onClick={onDeploy}>
            <RocketIcon />
            Deploy
          </ContextMenuItem>
        ) : null}
        {isApp && latest && onViewDeployment ? (
          <ContextMenuItem disabled={pending} onClick={onViewDeployment}>
            <ExternalLinkIcon />
            View deployment
          </ContextMenuItem>
        ) : null}
        {onDelete ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <Trash2Icon />
              Delete service
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function ProjectTopology({
  projectId,
  services,
  deployments,
  pending,
  onAddService,
  onAddResource,
  onDeploy,
  onRetry,
  onCancel,
  onViewDeployment,
  onOpen,
  onDelete,
}: ProjectTopologyProps) {
  const apps = services.filter((s) => s.type === "web" || s.type === "worker")
  const resources = services.filter(
    (s) => s.type === "postgres" || s.type === "redis",
  )

  function latestFor(serviceId: string) {
    return deployments.find((d) => d.serviceId === serviceId) ?? null
  }

  function hasSuccessfulDeploy(serviceId: string) {
    return deployments.some(
      (d) => d.serviceId === serviceId && d.status === "running",
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <SectionHeader
          title="Services"
          action={
            onAddService ? (
              <Button size="sm" variant="outline" onClick={onAddService}>
                <PlusIcon data-icon="inline-start" />
                Add service
              </Button>
            ) : null
          }
        />
        {apps.length === 0 ? (
          <div className="surface-panel flex flex-col items-start gap-3 p-6">
            <p className="text-sm font-medium">No services yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Add a web app or worker from Git to start deploying.
            </p>
            {onAddService ? (
              <Button size="sm" onClick={onAddService}>
                <PlusIcon data-icon="inline-start" />
                Add service
              </Button>
            ) : null}
          </div>
        ) : (
          <div className={cn("grid gap-4", apps.length > 1 && "sm:grid-cols-2")}>
            {apps.map((service) => {
              const latest = latestFor(service.id)
              return (
                <ServiceCard
                  key={service.id}
                  projectId={projectId}
                  service={service}
                  latest={latest}
                  hasSuccessfulDeploy={hasSuccessfulDeploy(service.id)}
                  pending={pending}
                  onDeploy={onDeploy ? () => onDeploy(service.id) : undefined}
                  onRetry={
                    onRetry && latest
                      ? () => onRetry(latest.id)
                      : undefined
                  }
                  onCancel={
                    onCancel && latest
                      ? () => onCancel(latest.id)
                      : undefined
                  }
                  onViewDeployment={
                    onViewDeployment && latest
                      ? () => onViewDeployment(service.id, latest.id)
                      : undefined
                  }
                  onOpen={onOpen ? () => onOpen(service.id) : undefined}
                  onDelete={onDelete ? () => onDelete(service.id) : undefined}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeader
          title="Resources"
          action={
            <AddResourceMenu
              pending={pending}
              onAddResource={onAddResource}
            />
          }
        />
        {resources.length === 0 ? (
          <div className="surface-panel flex flex-col items-start gap-3 p-6">
            <p className="text-sm font-medium">No resources yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Add a PostgreSQL or Redis resource and connect it to one or more
              services through environment variables.
            </p>
            <AddResourceMenu
              pending={pending}
              onAddResource={onAddResource}
              label="Add resource"
              variant="default"
            />
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-4",
              resources.length > 1 && "sm:grid-cols-2",
            )}
          >
            {resources.map((service) => (
              <ServiceCard
                key={service.id}
                projectId={projectId}
                service={service}
                hasSuccessfulDeploy={false}
                pending={pending}
                onOpen={onOpen ? () => onOpen(service.id) : undefined}
                onDelete={onDelete ? () => onDelete(service.id) : undefined}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
