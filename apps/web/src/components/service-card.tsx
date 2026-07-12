import type { LucideIcon } from "lucide-react"
import { BoxIcon, RocketIcon, ScrollTextIcon } from "lucide-react"
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
  onLogs?: () => void
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
  onLogs,
  className,
}: ServiceCardProps) {
  const isApp = type === "web" || type === "worker"
  const subtitle =
    type === "worker"
      ? "Worker process"
      : type === "postgres"
        ? "PostgreSQL"
        : type === "redis"
          ? "Redis"
          : `${isPrimary ? "Primary web" : "Web"} · :${containerPort ?? 80}`

  return (
    <article
      className={cn(
        "surface-panel flex flex-col gap-4 p-5 transition-colors hover:bg-card",
        className,
      )}
    >
      <Link
        to="/projects/$projectId/services/$serviceId"
        params={{ projectId, serviceId }}
        className="flex items-start justify-between gap-3"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="icon-well size-10 shrink-0">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold tracking-tight hover:underline">
              {name}
            </h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </Link>

      {publicUrl ? (
        <a
          className="block truncate rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5 font-mono text-[11px] hover:underline"
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
        <p className="text-xs text-destructive line-clamp-3">{errorMessage}</p>
      ) : null}

      {isApp && onDeploy && onLogs ? (
        <div className="mt-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onDeploy}
          >
            <RocketIcon data-icon="inline-start" />
            Deploy
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !hasDeployment}
            onClick={onLogs}
          >
            <ScrollTextIcon data-icon="inline-start" />
            Logs
          </Button>
        </div>
      ) : (
        <Link
          to="/projects/$projectId/services/$serviceId"
          params={{ projectId, serviceId }}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm hover:bg-muted/40"
        >
          Open
        </Link>
      )}
    </article>
  )
}
