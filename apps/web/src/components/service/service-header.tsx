import { useState } from "react"
import { Link } from "@tanstack/react-router"
import {
  CopyIcon,
  LinkIcon,
  RocketIcon,
  RotateCcwIcon,
} from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  resolveDeployPrimaryAction,
  type DeployPrimaryAction,
} from "@/lib/service/deployment-status"
import { cn } from "@/lib/utils"

type ServiceLike = {
  id: string
  name: string
  type: string
  status: string
  publicUrl?: string | null
  errorMessage?: string | null
  errorCode?: string | null
  git: { connected: boolean }
  image?: string | null
}

type DeploymentLike = {
  id: string
  status: string
}

export function ServiceHeader({
  projectId,
  projectName,
  service,
  latestDeployment,
  crumbExtra,
  pending,
  onDeploy,
  onRetry,
  onRetryProvision,
  onViewDeployment,
  className,
}: {
  projectId: string
  projectName: string
  service: ServiceLike
  latestDeployment?: DeploymentLike | null
  crumbExtra?: string | null
  pending?: boolean
  onDeploy: () => void
  onRetry: (deploymentId: string) => void
  onRetryProvision?: () => void
  onViewDeployment: (deploymentId: string) => void
  className?: string
}) {
  const [copiedUrl, setCopiedUrl] = useState(false)
  const isApp = service.type === "web" || service.type === "worker"
  const isData = service.type === "postgres" || service.type === "redis"
  const action: DeployPrimaryAction | null = isApp
    ? resolveDeployPrimaryAction({
        gitConnected: service.git.connected,
        latest: latestDeployment ?? null,
      })
    : null

  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-2">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="hover:text-foreground"
          >
            Projects
          </Link>
          <span aria-hidden>/</span>
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="hover:text-foreground"
          >
            {projectName}
          </Link>
          <span aria-hidden>/</span>
          <Link
            to="/projects/$projectId/services/$serviceId"
            params={{ projectId, serviceId: service.id }}
            search={{ tab: "overview" }}
            className={cn(
              crumbExtra ? "hover:text-foreground" : "text-foreground font-medium",
            )}
          >
            {service.name}
          </Link>
          {crumbExtra ? (
            <>
              <span aria-hidden>/</span>
              <span className="font-mono text-foreground">{crumbExtra}</span>
            </>
          ) : null}
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-[-0.03em]">
            {service.name}
          </h1>
          <StatusBadge status={service.status} context="service" />
          <span className="rounded-md border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
            {service.type}
          </span>
        </div>

        {service.publicUrl ? (
          <div className="flex max-w-xl flex-wrap items-center gap-2">
            <a
              href={service.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1.5 font-mono text-sm font-medium hover:underline"
            >
              <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {service.publicUrl.replace(/^https?:\/\//, "")}
              </span>
            </a>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => {
                void navigator.clipboard.writeText(service.publicUrl!)
                setCopiedUrl(true)
                window.setTimeout(() => setCopiedUrl(false), 1500)
              }}
            >
              <CopyIcon data-icon="inline-start" />
              {copiedUrl ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : isApp ? (
          <Link
            to="/projects/$projectId/services/$serviceId"
            params={{ projectId, serviceId: service.id }}
            search={{ tab: "settings", section: "domains" }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <LinkIcon className="size-3.5" />
            No public URL
          </Link>
        ) : null}

        {service.errorMessage ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">
                {service.errorCode === "deploy_failed"
                  ? "Deploy failed"
                  : "Service error"}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs">
                {service.errorMessage}
              </p>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {action ? (
          <Button
            disabled={
              pending ||
              (action.kind === "deploy" && !service.git.connected)
            }
            onClick={() => {
              if (action.kind === "view") onViewDeployment(action.deploymentId)
              else if (action.kind === "retry") onRetry(action.deploymentId)
              else onDeploy()
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
        {isData && service.status === "error" && onRetryProvision ? (
          <Button
            variant="outline"
            onClick={onRetryProvision}
            disabled={pending}
          >
            Retry provision
          </Button>
        ) : null}
      </div>
    </div>
  )
}
