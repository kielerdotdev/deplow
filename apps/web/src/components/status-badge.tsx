import { cn } from "@/lib/utils"
import { Badge } from "./ui/badge"

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "info"
  | "warning"

const statusVariant: Record<string, BadgeVariant> = {
  ready: "success",
  running: "success",
  completed: "success",
  online: "success",
  success: "success",
  connected: "success",
  succeeded: "success",
  provisioning: "info",
  analyzing: "info",
  building: "info",
  deploying: "info",
  checking: "info",
  queued: "secondary",
  pending: "secondary",
  created: "secondary",
  starting: "info",
  unknown: "outline",
  offline: "destructive",
  failed: "destructive",
  error: "destructive",
  rejected: "destructive",
  stopped: "warning",
  degraded: "warning",
  destroying: "secondary",
  ignored: "outline",
}

const statusDot: Record<BadgeVariant, string> = {
  default: "bg-primary-foreground/80",
  secondary: "bg-muted-foreground/70",
  destructive: "bg-destructive/75",
  outline: "bg-muted-foreground/60",
  success: "bg-success/75",
  info: "bg-info/75 animate-pulse",
  warning: "bg-warning/75",
}

/** Map internal status codes to calm UX labels. */
const statusLabel: Record<string, string> = {
  pending: "queued",
  queued: "queued",
  created: "queued",
  analyzing: "analyzing",
  building: "building",
  deploying: "deploying",
  checking: "checking",
  running: "online",
  failed: "failed",
  stopped: "stopped",
  degraded: "degraded",
  ready: "ready",
  online: "online",
  provisioning: "provisioning",
  error: "error",
  destroying: "destroying",
  success: "ready",
  succeeded: "done",
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
