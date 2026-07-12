import { cn } from "@/lib/utils"

type DeplowLogoProps = {
  size?: number
  className?: string
}

export function DeplowLogo({ size = 24, className }: DeplowLogoProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <rect
        x="2.5"
        y="4.5"
        width="27"
        height="23"
        rx="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9 16h10M19 16l-4.5-4M19 16l-4.5 4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="22"
        y="11.5"
        width="4.5"
        height="9"
        rx="1.25"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  )
}
