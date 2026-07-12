import { memo, type ReactNode } from "react"
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
  bodyClassName?: string
  showCloseButton?: boolean
}

/**
 * Shared create / view modal shell — sticky header/footer, scrollable body.
 * Caps height to the viewport so actions stay reachable on small screens.
 */
export const ActionDialog = memo(function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  icon: Icon,
  contentClassName,
  bodyClassName,
  showCloseButton = true,
}: ActionDialogProps) {
  if (!open) return null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn(
          // Nearly full-screen on small viewports; centered card on larger ones.
          "flex max-h-[calc(100dvh-32px)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 ring-1 ring-foreground/10",
          "top-4 bottom-auto translate-y-0 sm:top-1/2 sm:-translate-y-1/2",
          "max-sm:max-h-[calc(100dvh-16px)] max-sm:w-[calc(100%-0.75rem)]",
          sizeClass[size],
          contentClassName,
        )}
      >
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 bg-muted/20 px-5 py-4 pr-12">
          {Icon ? (
            <div className="icon-well mb-0.5 size-10 text-foreground">
              <Icon className="size-4" />
            </div>
          ) : null}
          <DialogTitle className="text-lg">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-sm leading-snug">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <DialogFooter className="m-0 shrink-0 flex-col gap-2 rounded-none border-t border-border/80 bg-muted/30 p-3 sm:flex-col sm:justify-stretch [&_button]:w-full">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
})
