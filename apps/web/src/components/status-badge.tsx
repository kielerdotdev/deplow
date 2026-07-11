import { cn } from "@/lib/utils"
import { Badge } from "./ui/badge"

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "info"

const statusVariant: Record<string, BadgeVariant> = {
  ready: "success",
  running: "success",
  completed: "success",
  online: "success",
  success: "success",
  connected: "success",
  provisioning: "info",
  building: "info",
  deploying: "info",
  queued: "secondary",
  pending: "secondary",
  starting: "info",
  unknown: "outline",
  offline: "destructive",
  failed: "destructive",
  error: "destructive",
  rejected: "destructive",
  stopped: "outline",
  destroying: "secondary",
  ignored: "outline",
}

const statusDot: Record<BadgeVariant, string> = {
  default: "bg-primary-foreground/80",
  secondary: "bg-muted-foreground",
  destructive: "bg-destructive",
  outline: "bg-muted-foreground",
  success: "bg-success",
  info: "bg-info animate-pulse",
}

/** Map internal status codes to calm UX labels. */
const statusLabel: Record<string, string> = {
  pending: "queued",
  queued: "queued",
  building: "building",
  deploying: "deploying",
  running: "online",
  failed: "failed",
  stopped: "stopped",
  ready: "ready",
  online: "online",
  provisioning: "provisioning",
  error: "error",
  destroying: "destroying",
  success: "ready",
  completed: "ready",
}

export function StatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const variant = statusVariant[status] ?? "outline"
  const label = statusLabel[status] ?? status
  return (
    <Badge variant={variant} className={cn("capitalize", className)}>
      <span
        className={cn("size-1.5 shrink-0 rounded-full", statusDot[variant])}
        aria-hidden
      />
      {label}
    </Badge>
  )
}
