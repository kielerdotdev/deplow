import { Trash2Icon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { ConfirmationButton } from "@/components/confirmation-button"

type ServiceDeleteDialogProps = {
  service: { id: string; name: string; type: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  pending?: boolean
  onConfirm: () => void | Promise<void>
}

export function ServiceDeleteDialog({
  service,
  open,
  onOpenChange,
  pending,
  onConfirm,
}: ServiceDeleteDialogProps) {
  if (!service) return null

  const isData = service.type === "postgres" || service.type === "redis"

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete service"
      description={`This permanently removes ${service.name} and its ${
        isData ? "data container and backups" : "deployment history"
      }. This cannot be undone.`}
      icon={Trash2Icon}
      footer={
        <ConfirmationButton
          disabled={pending}
          confirmLabel="Keep holding…"
          onConfirm={() => void onConfirm()}
        >
          Hold to delete
        </ConfirmationButton>
      }
    >
      <p className="text-sm text-muted-foreground">
        Hold the button below for about a second to confirm deletion of{" "}
        <span className="font-medium text-foreground">{service.name}</span>.
        Release early to cancel.
      </p>
    </ActionDialog>
  )
}
