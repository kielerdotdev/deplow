import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

export type CalloutVariant = "info" | "warning" | "success" | "troubleshooting"

const VARIANT: Record<
  CalloutVariant,
  { icon: LucideIcon; className: string; iconClass: string }
> = {
  info: {
    icon: InfoIcon,
    className: "border-border bg-muted/40 text-foreground",
    iconClass: "text-info",
  },
  warning: {
    icon: AlertTriangleIcon,
    className: "border-warning/30 bg-warning/8 text-foreground",
    iconClass: "text-warning",
  },
  success: {
    icon: CheckCircle2Icon,
    className: "border-success/30 bg-success/8 text-foreground",
    iconClass: "text-success",
  },
  troubleshooting: {
    icon: WrenchIcon,
    className: "border-border bg-muted/30 text-foreground",
    iconClass: "text-muted-foreground",
  },
}

type InfoCalloutProps = {
  variant?: CalloutVariant
  title?: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}

export function InfoCallout({
  variant = "info",
  title,
  children,
  className,
  action,
}: InfoCalloutProps) {
  const config = VARIANT[variant]
  const Icon = config.icon

  return (
    <aside
      role="note"
      data-testid="info-callout"
      data-variant={variant}
      className={cn(
        "flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        config.className,
        className,
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", config.iconClass)}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? (
          <p className="text-sm font-medium leading-snug">{title}</p>
        ) : null}
        <div className="text-sm leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-muted/80 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px] [&_code]:text-foreground">
          {children}
        </div>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </aside>
  )
}
