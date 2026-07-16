import { useState } from "react"
import type { LucideIcon } from "lucide-react"
import { AlertTriangleIcon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { Button } from "@/components/ui/button"

type ConfirmActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  pending?: boolean
  icon?: LucideIcon
  /** Destructive styling on the confirm button (default true). */
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  children?: React.ReactNode
}

/**
 * Simple cancel / confirm modal for destructive settings actions.
 * Prefer {@link ProjectDeleteDialog} (hold-to-confirm) for irreversible destroys.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pending = false,
  icon: Icon = AlertTriangleIcon,
  destructive = true,
  onConfirm,
  children,
}: ConfirmActionDialogProps) {
  const [busy, setBusy] = useState(false)
  const loading = pending || busy

  return (
    <ActionDialog
      open={open}
      onOpenChange={(next) => {
        if (loading) return
        onOpenChange(next)
      }}
      title={title}
      description={description}
      icon={Icon}
      size="sm"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={loading}
            onClick={() => {
              void (async () => {
                setBusy(true)
                try {
                  await onConfirm()
                  onOpenChange(false)
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            {loading ? "Working…" : confirmLabel}
          </Button>
        </div>
      }
    >
      {children ?? (
        <p className="text-sm text-muted-foreground">
          This action cannot be undone from the UI. Continue only if you meant
          to.
        </p>
      )}
    </ActionDialog>
  )
}
