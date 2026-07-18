import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import {
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

import { PanelActionButton } from "@/components/page-layout"
import { SoftHit } from "@/components/soft-hit"
import { StatusDot } from "@/components/status-dot"
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
  web: { label: "Web", icon: GlobeIcon },
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
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
      <span className="px-2 text-[14px] font-medium text-foreground">
        {title}
      </span>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function AddResourceMenu({
  pending,
  onAddResource,
  label = "Add resource",
}: {
  pending?: boolean
  onAddResource?: (type: "postgres" | "redis") => void
  label?: string
}) {
  if (!onAddResource) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        render={
          <SoftHit
            as="button"
            tone="solid"
            disabled={pending}
            className="shrink-0 outline-none"
          />
        }
      >
        <span className="flex h-8 items-center px-2.5 text-[13px] font-medium text-foreground/80">
          {label}
        </span>
      </DropdownMenuTrigger>
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

function ServiceRow({
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
  const host = service.publicUrl?.replace(/^https?:\/\//, "")
  const deployHint = latest
    ? `${sha ?? latest.id.slice(0, 8)} · ${deploymentStatusLabel[latest.status] ?? latest.status} · ${formatRelativeTime(latest.createdAt)}`
    : isApp
      ? "No deployments yet"
      : null

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="outline-none"
        render={
          <Link
            to="/projects/$projectId/services/$serviceId"
            params={{ projectId, serviceId: service.id }}
            className={cn(
              "app-row grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]",
            )}
            onClick={(e) => {
              if (onOpen) {
                e.preventDefault()
                onOpen()
              }
            }}
          />
        }
      >
        <div className="flex min-w-0 items-center gap-2.5 px-2">
          <StatusDot status={displayStatus} />
          <span className="truncate text-foreground">{service.name}</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">
            {meta.label}
          </span>
        </div>
        <div className="min-w-0 truncate px-2 font-mono text-[12px] text-muted-foreground">
          {isApp ? (host ?? "No public URL") : "—"}
        </div>
        <div className="min-w-0 truncate px-2 text-[12px] text-muted-foreground">
          {deployHint ?? "—"}
        </div>
        <div className="flex shrink-0 items-center gap-1 px-2">
          {isApp && action ? (
            <Button
              size="sm"
              variant={action.kind === "deploy" ? "default" : "ghost"}
              disabled={pending}
              className="h-7 rounded-sm px-2 text-[12px]"
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
          ) : null}
          {action?.kind === "view" &&
          latest &&
          isDeploymentInProgress(latest.status) &&
          onCancel ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              className="h-7 rounded-sm px-2 text-[12px]"
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
      </ContextMenuTrigger>
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
          Open
        </ContextMenuItem>
        {service.publicUrl ? (
          <ContextMenuItem
            render={
              <a href={service.publicUrl} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLinkIcon />
            Open URL
          </ContextMenuItem>
        ) : null}
        {isApp && onDeploy ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onDeploy}>
              <RocketIcon />
              Deploy
            </ContextMenuItem>
          </>
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

function EmptyBlock({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-8">
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      <p className="max-w-md text-[13px] text-muted-foreground">{description}</p>
      {action}
    </div>
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
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="border-b border-border">
        <SectionHeader
          title="Services"
          action={
            onAddService ? (
              <PanelActionButton onClick={onAddService} disabled={pending}>
                <span className="inline-flex items-center gap-1.5">
                  <PlusIcon className="size-3.5" />
                  Add service
                </span>
              </PanelActionButton>
            ) : null
          }
        />
        {apps.length === 0 ? (
          <EmptyBlock
            title="No services yet"
            description="Add a web app or worker from Git to start deploying."
            action={
              onAddService ? (
                <PanelActionButton onClick={onAddService} disabled={pending}>
                  Add service
                </PanelActionButton>
              ) : null
            }
          />
        ) : (
          apps.map((service) => {
            const latest = latestFor(service.id)
            return (
              <ServiceRow
                key={service.id}
                projectId={projectId}
                service={service}
                latest={latest}
                hasSuccessfulDeploy={hasSuccessfulDeploy(service.id)}
                pending={pending}
                onDeploy={onDeploy ? () => onDeploy(service.id) : undefined}
                onRetry={
                  onRetry && latest ? () => onRetry(latest.id) : undefined
                }
                onCancel={
                  onCancel && latest ? () => onCancel(latest.id) : undefined
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
          })
        )}
      </section>

      <section>
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
          <EmptyBlock
            title="No resources yet"
            description="Add PostgreSQL or Redis and connect it through environment variables."
            action={
              <AddResourceMenu
                pending={pending}
                onAddResource={onAddResource}
                label="Add resource"
              />
            }
          />
        ) : (
          resources.map((service) => (
            <ServiceRow
              key={service.id}
              projectId={projectId}
              service={service}
              hasSuccessfulDeploy={false}
              pending={pending}
              onOpen={onOpen ? () => onOpen(service.id) : undefined}
              onDelete={onDelete ? () => onDelete(service.id) : undefined}
            />
          ))
        )}
      </section>
    </div>
  )
}
