import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const sizeClass = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const

type ActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof sizeClass
  /** Optional icon above the title (Railway create-flow style) */
  icon?: LucideIcon
  contentClassName?: string
  showCloseButton?: boolean
}

/**
 * Shared create / view modal shell — header, body, optional footer.
 */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  icon: Icon,
  contentClassName,
  showCloseButton = true,
}: ActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn(
          "gap-0 overflow-hidden p-0 ring-1 ring-foreground/10",
          sizeClass[size],
          contentClassName,
        )}
      >
        <DialogHeader className="gap-2 border-b border-border/80 px-5 py-5 pr-12">
          {Icon ? (
            <div className="mb-1 flex size-10 items-center justify-center rounded-xl border border-border/80 bg-muted/50 text-foreground">
              <Icon className="size-5" />
            </div>
          ) : null}
          <DialogTitle className="text-lg">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-sm leading-relaxed">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="px-5 py-5">{children}</div>
        {footer ? (
          <DialogFooter className="m-0 flex-col gap-2 rounded-none border-t border-border/80 bg-muted/30 p-4 sm:flex-col sm:justify-stretch [&_button]:w-full">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
