import { Badge } from "./ui/badge"

const statusVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  running: "default",
  completed: "default",
  online: "default",
  provisioning: "secondary",
  building: "secondary",
  pending: "secondary",
  starting: "secondary",
  unknown: "outline",
  offline: "destructive",
  failed: "destructive",
  error: "destructive",
  stopped: "outline",
  destroying: "secondary",
}

export function StatusBadge({ status }: { status: string }) {
  const variant = statusVariant[status] ?? "outline"
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  )
}
