import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type ActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: "md" | "lg" | "xl"
  contentClassName?: string
}

export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  contentClassName,
}: ActionDialogProps) {
  const sizeClass =
    size === "xl"
      ? "sm:max-w-3xl"
      : size === "lg"
        ? "sm:max-w-xl"
        : "sm:max-w-lg"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(sizeClass, contentClassName)}
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}
