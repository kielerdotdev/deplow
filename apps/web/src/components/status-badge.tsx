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
  mesh_ready: "mesh ready",
  mesh_logged_out: "logged out",
  mesh_missing: "no mesh",
  deploy_ready: "ready",
  deploy_blocked: "blocked",
  netbird: "netbird",
  tailscale: "tailscale",
  connected: "connected",
  connecting: "connecting",
  disconnected: "disconnected",
}

const serviceLabel: Record<string, string> = {
  ...statusLabel,
  running: "Healthy",
  ready: "Healthy",
  deploying: "Deploying",
  error: "Unavailable",
  stopped: "Stopped",
  not_deployed: "Not deployed",
}

const statusVariantExtra: Record<string, BadgeVariant> = {
  not_deployed: "secondary",
  mesh_ready: "success",
  mesh_logged_out: "warning",
  mesh_missing: "destructive",
  deploy_ready: "success",
  deploy_blocked: "warning",
  netbird: "info",
  tailscale: "info",
  connected: "success",
  connecting: "info",
  disconnected: "secondary",
}

const deploymentLabel: Record<string, string> = {
  pending: "Queued",
  queued: "Queued",
  analyzing: "Analyzing",
  building: "Building",
  deploying: "Releasing",
  checking: "Verifying",
  running: "Succeeded",
  failed: "Failed",
  stopped: "Stopped",
}

export function StatusBadge({
  status,
  className,
  context,
}: {
  status: string
  className?: string
  /** Prefer service vs deployment wording when statuses overlap. */
  context?: "service" | "deployment" | "default"
}) {
  const variant =
    statusVariantExtra[status] ?? statusVariant[status] ?? "outline"
  const label =
    context === "service"
      ? (serviceLabel[status] ?? statusLabel[status] ?? status)
      : context === "deployment"
        ? (deploymentLabel[status] ?? statusLabel[status] ?? status)
        : (statusLabel[status] ?? status)
  return (
    <Badge
      variant={variant}
      className={cn(
        context === "service" || context === "deployment"
          ? undefined
          : "capitalize",
        className,
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", statusDot[variant])}
        aria-hidden
      />
      {label}
    </Badge>
  )
}
