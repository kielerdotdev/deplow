import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type PageSectionProps = {
  title: string
  description?: string
  icon?: LucideIcon
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function PageSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
}: PageSectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon ? (
            <div className="icon-well mt-0.5 size-7 shrink-0">
              <Icon className="size-3.5" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold tracking-tight">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  )
}
