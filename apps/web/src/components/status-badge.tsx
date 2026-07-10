import { Badge } from "./ui/badge"

const statusVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  running: "default",
  completed: "default",
  online: "default",
  success: "default",
  connected: "default",
  provisioning: "secondary",
  building: "secondary",
  deploying: "secondary",
  queued: "secondary",
  pending: "secondary",
  starting: "secondary",
  unknown: "outline",
  offline: "destructive",
  failed: "destructive",
  error: "destructive",
  rejected: "destructive",
  stopped: "outline",
  destroying: "secondary",
  ignored: "outline",
}

/** Map internal status codes to calm UX labels. */
const statusLabel: Record<string, string> = {
  pending: "queued",
  queued: "queued",
  building: "building",
  deploying: "deploying",
  running: "running",
  failed: "failed",
  stopped: "stopped",
  ready: "ready",
  provisioning: "provisioning",
  error: "error",
  destroying: "destroying",
}

export function StatusBadge({ status }: { status: string }) {
  const variant = statusVariant[status] ?? "outline"
  const label = statusLabel[status] ?? status
  return (
    <Badge variant={variant} className="capitalize">
      {label}
    </Badge>
  )
}
