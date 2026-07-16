import type { LucideIcon } from "lucide-react"
import { BoxIcon, RocketIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ServiceCardProps = {
  projectId: string
  serviceId: string
  name: string
  type: "web" | "worker" | "postgres" | "redis"
  isPrimary?: boolean
  containerPort?: number
  status: string
  publicUrl?: string | null
  errorMessage?: string | null
  icon?: LucideIcon
  pending?: boolean
  hasDeployment?: boolean
  onDeploy?: () => void
  onViewDeployment?: () => void
  className?: string
}

export function ServiceCard({
  projectId,
  serviceId,
  name,
  type,
  isPrimary,
  containerPort,
  status,
  publicUrl,
  errorMessage,
  icon: Icon = BoxIcon,
  pending,
  hasDeployment,
  onDeploy,
  onViewDeployment,
  className,
}: ServiceCardProps) {
  const isApp = type === "web" || type === "worker"
  const subtitle =
    type === "worker"
      ? "Worker"
      : type === "postgres"
        ? "PostgreSQL"
        : type === "redis"
          ? "Redis"
          : `${isPrimary ? "Primary" : "Web"} · :${containerPort ?? 80}`

  return (
    <article
      className={cn(
        "surface-panel flex flex-col gap-3 p-4 transition-colors hover:bg-muted/20",
        className,
      )}
    >
      <Link
        to="/projects/$projectId/services/$serviceId"
        params={{ projectId, serviceId }}
        className="flex items-start justify-between gap-3"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="icon-well size-8 shrink-0">
            <Icon className="size-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold tracking-tight hover:underline">
              {name}
            </h3>
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </Link>

      {publicUrl ? (
        <a
          className="block truncate rounded-md bg-muted/50 px-2 py-1 font-mono text-[11px] text-foreground/80 hover:bg-muted hover:underline"
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {publicUrl}
        </a>
      ) : isApp ? (
        <p className="text-[11px] text-muted-foreground">
          No URL yet — deploy or configure Domains
        </p>
      ) : null}

      {errorMessage ? (
        <p className="text-xs text-destructive line-clamp-2">{errorMessage}</p>
      ) : null}

      {isApp && onDeploy ? (
        <div className="mt-auto flex gap-1.5">
          <Button size="sm" disabled={pending} onClick={onDeploy}>
            <RocketIcon data-icon="inline-start" />
            Deploy
          </Button>
          {onViewDeployment ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending || !hasDeployment}
              onClick={onViewDeployment}
            >
              View
            </Button>
          ) : null}
        </div>
      ) : (
        <Link
          to="/projects/$projectId/services/$serviceId"
          params={{ projectId, serviceId }}
          className="mt-auto inline-flex h-8 w-fit items-center justify-center rounded-md border border-border/80 bg-background px-2.5 text-xs font-medium hover:bg-muted/50"
        >
          Open
        </Link>
      )}
    </article>
  )
}
