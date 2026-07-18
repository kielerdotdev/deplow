import { cn } from "@/lib/utils"

type SoftHitProps = {
  children: React.ReactNode
  className?: string
  contentClassName?: string
  active?: boolean
  /** Solid fill hit (panel buttons) vs translucent chrome hit. */
  tone?: "chrome" | "solid"
  as?: "div" | "button"
  type?: "button" | "submit"
  onClick?: React.MouseEventHandler<HTMLElement>
  disabled?: boolean
  title?: string
}

/**
 * Atlasflow-style hover surface: soft fill that expands from inset on hover
 * and contracts on press. Active keeps the fill fully expanded.
 */
export function SoftHit({
  children,
  className,
  contentClassName,
  active = false,
  tone = "chrome",
  as = "div",
  type = "button",
  onClick,
  disabled,
  title,
}: SoftHitProps) {
  const fill =
    tone === "solid"
      ? "bg-secondary group-hover/h:bg-secondary/80 group-active/h:bg-secondary/90"
      : "bg-foreground/[0.08]"

  const shellClass = cn(
    "group/h relative flex cursor-pointer items-center rounded-sm",
    !className?.includes("w-full") && "w-fit",
    disabled && "pointer-events-none opacity-50",
    className,
  )

  const fillEl = (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-sm transition-[inset,opacity] duration-150 ease-out",
        fill,
        active
          ? "inset-0 opacity-100"
          : "inset-1 opacity-0 group-hover/h:inset-0 group-hover/h:opacity-100 group-active/h:inset-px",
      )}
    />
  )

  const content = (
    <span
      className={cn(
        "relative z-[2] flex w-full min-w-0 items-center",
        contentClassName,
      )}
    >
      {children}
    </span>
  )

  if (as === "button") {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        title={title}
        data-active={active ? "" : undefined}
        className={shellClass}
      >
        {fillEl}
        {content}
      </button>
    )
  }

  return (
    <div
      onClick={onClick}
      title={title}
      data-active={active ? "" : undefined}
      className={shellClass}
    >
      {fillEl}
      {content}
    </div>
  )
}
