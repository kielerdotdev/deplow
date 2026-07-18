import { cn } from "@/lib/utils"

type StatusTone = "success" | "warning" | "danger" | "muted" | "info"

const toneColor: Record<StatusTone, { core: string; ring: string }> = {
  success: {
    core: "rgb(34, 197, 94)",
    ring: "rgba(34, 197, 94, 0.25)",
  },
  warning: {
    core: "rgb(245, 158, 11)",
    ring: "rgba(245, 158, 11, 0.25)",
  },
  danger: {
    core: "rgb(239, 68, 68)",
    ring: "rgba(239, 68, 68, 0.25)",
  },
  muted: {
    core: "rgb(112, 112, 112)",
    ring: "rgba(255, 255, 255, 0.15)",
  },
  info: {
    core: "rgb(96, 165, 250)",
    ring: "rgba(96, 165, 250, 0.25)",
  },
}

const statusTone: Record<string, StatusTone> = {
  ready: "success",
  running: "success",
  completed: "success",
  online: "success",
  success: "success",
  connected: "success",
  succeeded: "success",
  building: "warning",
  deploying: "warning",
  analyzing: "warning",
  checking: "warning",
  provisioning: "info",
  starting: "info",
  queued: "muted",
  pending: "muted",
  created: "muted",
  stopped: "muted",
  unknown: "muted",
  ignored: "muted",
  not_deployed: "muted",
  destroying: "muted",
  failed: "danger",
  error: "danger",
  rejected: "danger",
  offline: "danger",
  degraded: "warning",
}

const pulseStatuses = new Set([
  "building",
  "deploying",
  "analyzing",
  "checking",
  "provisioning",
  "starting",
])

export function statusToneFor(status: string): StatusTone {
  return statusTone[status] ?? "muted"
}

export function StatusDot({
  status,
  className,
  pulse,
}: {
  status: string
  className?: string
  pulse?: boolean
}) {
  const tone = statusToneFor(status)
  const colors = toneColor[tone]
  const shouldPulse = pulse ?? pulseStatuses.has(status)

  return (
    <span
      className={cn(
        "relative flex size-5 shrink-0 items-center justify-center",
        className,
      )}
      aria-hidden
    >
      <span
        className={cn(
          "absolute rounded-full",
          shouldPulse ? "size-2 animate-status-ring" : "size-3.5",
        )}
        style={{ backgroundColor: colors.ring }}
      />
      <span
        className="absolute z-10 size-2 rounded-full"
        style={{ backgroundColor: colors.core }}
      />
    </span>
  )
}
