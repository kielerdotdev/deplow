import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "gap-0 overflow-hidden bg-card p-0 sm:max-w-md md:max-w-lg",
          className,
        )}
      >
        <SheetHeader className="shrink-0 space-y-1.5 border-b border-border/60 px-6 py-5 pr-14 text-left">
          <SheetTitle className="text-base font-semibold tracking-tight">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="font-mono text-xs break-all">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
