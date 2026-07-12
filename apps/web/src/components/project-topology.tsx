import { Link } from "@tanstack/react-router"
import {
  BoxIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  GlobeIcon,
  RocketIcon,
  ScrollTextIcon,
  Trash2Icon,
  WorkflowIcon,
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
import { cn } from "@/lib/utils"

type Service = {
  id: string
  name: string
  type: "web" | "worker" | "postgres" | "redis"
  isPrimary?: boolean
  containerPort?: number
  status: string
  publicUrl?: string | null
  errorMessage?: string | null
}

type Deployment = {
  serviceId: string
  status: string
}

type ProjectTopologyProps = {
  projectId: string
  services: Service[]
  deployments: Deployment[]
  pending?: boolean
  onAddService?: () => void
  onDeploy?: (serviceId: string) => void
  onLogs?: (serviceId: string) => void
  onOpen?: (serviceId: string) => void
  onDelete?: (serviceId: string) => void
}

const typeMeta = {
  web: { label: "Web", icon: GlobeIcon, tone: "text-muted-foreground" },
  worker: { label: "Worker", icon: BoxIcon, tone: "text-muted-foreground" },
  postgres: { label: "PostgreSQL", icon: DatabaseIcon, tone: "text-muted-foreground" },
  redis: { label: "Redis", icon: WorkflowIcon, tone: "text-muted-foreground" },
} as const

function inferredBindings(apps: Service[], data: Service[]) {
  const links: { appId: string; dataId: string; envKey: string }[] = []
  for (const app of apps) {
    const pg = data.find((s) => s.type === "postgres")
    const redis = data.find((s) => s.type === "redis")
    if (pg) links.push({ appId: app.id, dataId: pg.id, envKey: "DATABASE_URL" })
    if (redis) links.push({ appId: app.id, dataId: redis.id, envKey: "REDIS_URL" })
  }
  return links
}

function TopologyNode({
  projectId,
  service,
  status,
  hasDeployment,
  pending,
  onDeploy,
  onLogs,
  onOpen,
  onDelete,
}: {
  projectId: string
  service: Service
  status: string
  hasDeployment: boolean
  pending?: boolean
  onDeploy?: () => void
  onLogs?: () => void
  onOpen?: () => void
  onDelete?: () => void
}) {
  const meta = typeMeta[service.type]
  const Icon = meta.icon
  const isApp = service.type === "web" || service.type === "worker"
  const subtitle =
    service.type === "web"
      ? `${service.isPrimary ? "Primary" : "Web"} · :${service.containerPort ?? 80}`
      : meta.label

  const node = (
    <article className="topology-node group">
      <Link
        to="/projects/$projectId/services/$serviceId"
        params={{ projectId, serviceId: service.id }}
        className="topology-node-link"
      >
        <div className={cn("topology-node-icon", meta.tone)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold tracking-tight">
              {service.name}
            </h3>
            <StatusBadge status={status} className="shrink-0" />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          {service.publicUrl ? (
            <p className="mt-1 truncate font-mono text-[11px] text-foreground/75">
              {service.publicUrl.replace(/^https?:\/\//, "")}
            </p>
          ) : null}
          {service.errorMessage ? (
            <p className="mt-1 text-xs text-destructive line-clamp-1">
              {service.errorMessage}
            </p>
          ) : null}
        </div>
      </Link>
      {isApp && onDeploy && onLogs ? (
        <div className="topology-node-actions">
          <Button size="sm" disabled={pending} onClick={onDeploy}>
            <RocketIcon data-icon="inline-start" />
            Deploy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending || !hasDeployment}
            onClick={onLogs}
          >
            <ScrollTextIcon data-icon="inline-start" />
            Logs
          </Button>
        </div>
      ) : null}
    </article>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger className="outline-none">{node}</ContextMenuTrigger>
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
        {isApp && onLogs ? (
          <ContextMenuItem
            disabled={pending || !hasDeployment}
            onClick={onLogs}
          >
            <ScrollTextIcon />
            Logs
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
  onDeploy,
  onLogs,
  onOpen,
  onDelete,
}: ProjectTopologyProps) {
  const apps = services.filter((s) => s.type === "web" || s.type === "worker")
  const data = services.filter((s) => s.type === "postgres" || s.type === "redis")
  const bindings = inferredBindings(apps, data)
  const bindingKeys = [...new Set(bindings.map((b) => b.envKey))]

  if (services.length === 0) {
    return (
      <div className="topology-empty">
        <p className="text-sm text-muted-foreground">
          No services yet. Add a web app, worker, Postgres, or Redis.
        </p>
        {onAddService ? (
          <Button size="sm" onClick={onAddService}>
            Add service
          </Button>
        ) : null}
      </div>
    )
  }

  const statusFor = (serviceId: string, fallback: string) =>
    deployments.find((d) => d.serviceId === serviceId)?.status ?? fallback

  return (
    <div className="topology-board">
      <div className="topology-columns">
        <section className="topology-column">
          <header className="topology-column-head">
            <span>Apps</span>
            <span className="text-muted-foreground">{apps.length}</span>
          </header>
          <div className="topology-column-body">
            {apps.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                No web or worker services.
              </p>
            ) : (
              apps.map((service) => (
                <TopologyNode
                  key={service.id}
                  projectId={projectId}
                  service={service}
                  status={statusFor(service.id, service.status)}
                  hasDeployment={deployments.some(
                    (d) => d.serviceId === service.id,
                  )}
                  pending={pending}
                  onDeploy={
                    onDeploy ? () => onDeploy(service.id) : undefined
                  }
                  onLogs={onLogs ? () => onLogs(service.id) : undefined}
                  onOpen={onOpen ? () => onOpen(service.id) : undefined}
                  onDelete={onDelete ? () => onDelete(service.id) : undefined}
                />
              ))
            )}
          </div>
        </section>

        {bindingKeys.length > 0 ? (
          <section className="topology-bindings" aria-label="Bindings">
            {bindingKeys.map((envKey) => (
              <div key={envKey} className="topology-binding">
                <span className="topology-binding-line" aria-hidden />
                <span className="topology-binding-key">{envKey}</span>
              </div>
            ))}
          </section>
        ) : null}

        <section className="topology-column">
          <header className="topology-column-head">
            <span>Data services</span>
            <span className="text-muted-foreground">{data.length}</span>
          </header>
          <div className="topology-column-body">
            {data.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                Postgres and Redis bind explicitly to apps.
              </p>
            ) : (
              data.map((service) => (
                <TopologyNode
                  key={service.id}
                  projectId={projectId}
                  service={service}
                  status={statusFor(service.id, service.status)}
                  hasDeployment={false}
                  pending={pending}
                  onOpen={onOpen ? () => onOpen(service.id) : undefined}
                  onDelete={onDelete ? () => onDelete(service.id) : undefined}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
