import { Trash2Icon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { ConfirmationButton } from "@/components/confirmation-button"

type ProjectDeleteDialogProps = {
  project: { id: string; name: string; serviceCount?: number } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  pending?: boolean
  onConfirm: () => void | Promise<void>
}

export function ProjectDeleteDialog({
  project,
  open,
  onOpenChange,
  pending,
  onConfirm,
}: ProjectDeleteDialogProps) {
  if (!project) return null

  const serviceCount = project.serviceCount ?? 0
  const serviceLabel =
    serviceCount === 1 ? "1 service" : `${serviceCount} services`

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Destroy project"
      description={`This permanently removes ${project.name}, all ${serviceLabel}, data containers, and backups. This cannot be undone.`}
      icon={Trash2Icon}
      footer={
        <ConfirmationButton
          disabled={pending}
          confirmLabel="Keep holding…"
          onConfirm={() => void onConfirm()}
        >
          Hold to destroy
        </ConfirmationButton>
      }
    >
      <p className="text-sm text-muted-foreground">
        Hold the button below for about a second to confirm destruction of{" "}
        <span className="font-medium text-foreground">{project.name}</span>.
        Release early to cancel.
      </p>
    </ActionDialog>
  )
}
