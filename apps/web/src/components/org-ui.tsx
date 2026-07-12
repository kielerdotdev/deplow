import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const AVATAR_TONES = [
  "bg-primary/12 text-primary",
  "bg-info/12 text-info",
  "bg-success/12 text-success",
  "bg-chart-4/20 text-foreground",
] as const

export function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || "OR"
}

export function orgAvatarTone(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length
  }
  return AVATAR_TONES[hash] ?? AVATAR_TONES[0]!
}

export function OrgAvatar({
  name,
  id,
  size = "md",
  className,
}: {
  name: string
  id?: string
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const sizeClass =
    size === "sm"
      ? "size-7 text-[10px]"
      : size === "lg"
        ? "size-12 text-base"
        : "size-8 text-xs"

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-semibold tracking-tight",
        sizeClass,
        orgAvatarTone(id ?? name),
        className,
      )}
      aria-hidden
    >
      {orgInitials(name)}
    </div>
  )
}

export function RoleBadge({
  role,
  className,
}: {
  role: "owner" | "member" | string
  className?: string
}) {
  const isOwner = role === "owner"
  return (
    <Badge
      variant={isOwner ? "info" : "secondary"}
      className={cn("capitalize", className)}
    >
      {role}
    </Badge>
  )
}

export function PersonAvatar({
  name,
  email,
  className,
}: {
  name: string
  email?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted text-xs font-medium uppercase text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      {orgInitials(name || email || "?")}
    </div>
  )
}
