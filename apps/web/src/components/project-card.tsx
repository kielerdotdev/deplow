import { Link } from "@tanstack/react-router"

import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { formatDateTime, summarizeDeployError } from "@/lib/ui-format"

type ProjectCardProps = {
  id: string
  name: string
  status: string
  publicUrl?: string | null
  errorMessage?: string | null
  updatedAt: string
  className?: string
}

export function ProjectCard({
  id,
  name,
  status,
  publicUrl,
  errorMessage,
  updatedAt,
  className,
}: ProjectCardProps) {
  const host = publicUrl?.replace(/^https?:\/\//, "")
  const showStatus = status !== "ready" || Boolean(errorMessage)

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: id }}
      className={cn(
        "group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium tracking-tight">{name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {host ?? "Not deployed"}
        </p>
        {errorMessage ? (
          <p
            className="mt-1 truncate text-xs text-destructive"
            title={errorMessage}
          >
            {summarizeDeployError(errorMessage)}
          </p>
        ) : null}
      </div>
      {showStatus ? <StatusBadge status={status} /> : null}
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
        {formatDateTime(updatedAt)}
      </span>
    </Link>
  )
}
