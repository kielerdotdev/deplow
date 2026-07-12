import { Link } from "@tanstack/react-router"
import { ArrowRightIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type DashboardCardProps = {
  title: string
  count?: number
  href?: "/integrations" | "/nodes" | "/"
  onAdd?: () => void
  children: React.ReactNode
  className?: string
  empty?: React.ReactNode
}

export function DashboardCard({
  title,
  count,
  href,
  onAdd,
  children,
  className,
  empty,
}: DashboardCardProps) {
  const body = empty ?? children

  return (
    <section
      className={cn("surface-panel flex flex-col overflow-hidden", className)}
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {typeof count === "number" ? (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
            {count}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {onAdd ? (
            <Button
              size="icon-sm"
              variant="outline"
              onClick={onAdd}
              aria-label={`Add ${title.toLowerCase()}`}
            >
              <PlusIcon />
            </Button>
          ) : null}
          {href ? (
            <Button
              size="icon-sm"
              variant="ghost"
              render={<Link to={href} />}
              aria-label={`Open ${title}`}
            >
              <ArrowRightIcon />
            </Button>
          ) : null}
        </div>
      </header>
      <div className="min-h-0 flex-1">{body}</div>
    </section>
  )
}

type DashboardRowProps = {
  leading?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
  children?: never
} & (
  | {
      to: "/projects/$projectId"
      params: { projectId: string }
      onClick?: never
    }
  | {
      to: "/integrations" | "/nodes"
      params?: never
      onClick?: never
    }
  | {
      to?: never
      params?: never
      onClick?: () => void
    }
)

export function DashboardRow(props: DashboardRowProps) {
  const { leading, title, subtitle, trailing } = props
  const content = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      {trailing ? (
        <div className="ml-3 shrink-0 text-xs text-muted-foreground">
          {trailing}
        </div>
      ) : null}
    </>
  )

  const className =
    "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 transition-colors hover:bg-muted/50"

  if (props.to === "/projects/$projectId") {
    return (
      <Link
        to="/projects/$projectId"
        params={props.params}
        className={className}
      >
        {content}
      </Link>
    )
  }

  if (props.to) {
    return (
      <Link to={props.to} className={className}>
        {content}
      </Link>
    )
  }

  if (props.onClick) {
    return (
      <button type="button" onClick={props.onClick} className={className}>
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}

type StatBlockProps = {
  label: string
  value: string | number
  hint?: string
}

export function StatBlock({ label, value, hint }: StatBlockProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 border-r border-border px-4 py-4 last:border-r-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
