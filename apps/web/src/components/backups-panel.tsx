import { useState } from "react"
import { DatabaseBackupIcon, DownloadIcon, RotateCcwIcon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { DashboardCard } from "@/components/dashboard-card"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { client } from "@/lib/orpc"
import { formatDateTime, formatRelativeTime } from "@/lib/ui-format"

type BackupRow = Awaited<ReturnType<typeof client.projects.listBackups>>[number]

type PitrStatus = Awaited<ReturnType<typeof client.projects.pitrStatus>>

type BackupsPanelProps = {
  projectId: string
  projectName: string
  backups: BackupRow[]
  pitr: PitrStatus
  onRefresh: () => Promise<void>
}

export function BackupsPanel({
  projectId,
  projectName,
  backups,
  pitr,
  onRefresh,
}: BackupsPanelProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoreId, setRestoreId] = useState<string | null>(null)
  const [pitrOpen, setPitrOpen] = useState(false)

  const snapshots = backups.filter(
    (b) =>
      b.status === "completed" &&
      (b.kind === "snapshot" ||
        b.kind === "postgres" ||
        b.kind === "redis" ||
        !b.kind),
  )

  async function runBackup() {
    setPending(true)
    setError(null)
    try {
      await client.projects.backup({ id: projectId })
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function download(backupId: string) {
    setPending(true)
    setError(null)
    try {
      const file = await client.projects.downloadBackup({
        id: projectId,
        backupId,
      })
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: file.contentType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = file.storageKey.split("/").pop() ?? "backup.dump"
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Backup action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <DashboardCard title="Point-in-time recovery">
        <div className="space-y-3 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            {pitr.enabled
              ? (pitr.message ??
                `Recoverable window ${pitr.windowStart ? formatDateTime(pitr.windowStart) : "—"} → ${pitr.windowEnd ? formatDateTime(pitr.windowEnd) : "now"}`)
              : (pitr.message ?? "PITR is off. Snapshots still work below.")}
          </p>
          <p className="text-xs text-muted-foreground">
            PITR restores this project&apos;s dedicated Postgres container
            (stanza {pitr.stanza}).
          </p>
          {pitr.lastBaseBackupAt ? (
            <p className="text-xs text-muted-foreground">
              Last base backup {formatRelativeTime(pitr.lastBaseBackupAt)}
            </p>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !pitr.enabled}
            onClick={() => setPitrOpen(true)}
          >
            <RotateCcwIcon data-icon="inline-start" />
            Restore to point in time
          </Button>
        </div>
      </DashboardCard>

      <DashboardCard
        title="Snapshots"
        count={snapshots.length}
        onAdd={() => void runBackup()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <p className="text-xs text-muted-foreground">
            Per-resource snapshots (Postgres dump, Redis export) · last{" "}
            {snapshots.length} kept
          </p>
          <Button size="sm" disabled={pending} onClick={() => void runBackup()}>
            <DatabaseBackupIcon data-icon="inline-start" />
            Run backup
          </Button>
        </div>
        {backups.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            No backups yet
          </p>
        ) : (
          backups.map((backup) => (
            <div
              key={backup.id}
              className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs">
                  {backup.storageKey.split("/").pop()}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {backup.kind ?? "snapshot"}
                  {backup.createdAt
                    ? ` · ${formatRelativeTime(backup.createdAt)}`
                    : ""}
                  {backup.sizeBytes
                    ? ` · ${Math.round(backup.sizeBytes / 1024)} KB`
                    : ""}
                </p>
              </div>
              <StatusBadge status={backup.status} />
              {backup.status === "completed" &&
              (backup.kind === "snapshot" ||
                backup.kind === "postgres" ||
                backup.kind === "redis" ||
                !backup.kind) ? (
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => void download(backup.id)}
                    aria-label="Download"
                  >
                    <DownloadIcon />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => setRestoreId(backup.id)}
                  >
                    Restore
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </DashboardCard>

      <RestoreSnapshotDialog
        open={Boolean(restoreId)}
        backupId={restoreId}
        projectId={projectId}
        projectName={projectName}
        onOpenChange={(open) => {
          if (!open) setRestoreId(null)
        }}
        onRestored={onRefresh}
        onError={setError}
      />

      <PitrRestoreDialog
        open={pitrOpen}
        onOpenChange={setPitrOpen}
        projectId={projectId}
        projectName={projectName}
        pitr={pitr}
        onRestored={onRefresh}
        onError={setError}
      />
    </div>
  )
}

function RestoreSnapshotDialog({
  open,
  backupId,
  projectId,
  projectName,
  onOpenChange,
  onRestored,
  onError,
}: {
  open: boolean
  backupId: string | null
  projectId: string
  projectName: string
  onOpenChange: (open: boolean) => void
  onRestored: () => Promise<void>
  onError: (message: string | null) => void
}) {
  if (!open || !backupId) return null
  return (
    <RestoreSnapshotDialogBody
      backupId={backupId}
      projectId={projectId}
      projectName={projectName}
      onOpenChange={onOpenChange}
      onRestored={onRestored}
      onError={onError}
    />
  )
}

function RestoreSnapshotDialogBody({
  backupId,
  projectId,
  projectName,
  onOpenChange,
  onRestored,
  onError,
}: {
  backupId: string
  projectId: string
  projectName: string
  onOpenChange: (open: boolean) => void
  onRestored: () => Promise<void>
  onError: (message: string | null) => void
}) {
  const [confirmName, setConfirmName] = useState("")
  const [pending, setPending] = useState(false)

  async function restoreSnapshot(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    onError(null)
    try {
      await client.projects.restoreBackup({
        id: projectId,
        backupId,
        confirmName,
      })
      onOpenChange(false)
      await onRestored()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title="Restore snapshot"
      description="This overwrites the live resource for this backup. Type the project name to confirm."
      footer={
        <Button
          type="submit"
          form="restore-snapshot"
          variant="destructive"
          disabled={pending || confirmName !== projectName}
        >
          Restore
        </Button>
      }
    >
      <form
        id="restore-snapshot"
        className="space-y-3"
        onSubmit={(e) => void restoreSnapshot(e)}
      >
        <div className="space-y-1.5">
          <Label htmlFor="confirm-name">Project name</Label>
          <Input
            id="confirm-name"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={projectName}
            autoFocus
          />
        </div>
      </form>
    </ActionDialog>
  )
}

function PitrRestoreDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  pitr,
  onRestored,
  onError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  pitr: PitrStatus
  onRestored: () => Promise<void>
  onError: (message: string | null) => void
}) {
  if (!open) return null
  return (
    <PitrRestoreDialogBody
      onOpenChange={onOpenChange}
      projectId={projectId}
      projectName={projectName}
      pitr={pitr}
      onRestored={onRestored}
      onError={onError}
    />
  )
}

function PitrRestoreDialogBody({
  onOpenChange,
  projectId,
  projectName,
  pitr,
  onRestored,
  onError,
}: {
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  pitr: PitrStatus
  onRestored: () => Promise<void>
  onError: (message: string | null) => void
}) {
  const [confirmName, setConfirmName] = useState("")
  const [targetAt, setTargetAt] = useState("")
  const [pending, setPending] = useState(false)

  async function restorePitr(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    onError(null)
    try {
      await client.projects.restorePitr({
        id: projectId,
        targetAt: new Date(targetAt).toISOString(),
        confirmName,
      })
      onOpenChange(false)
      await onRestored()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title="Restore to point in time"
      description="Restores this project’s database via a temporary cluster. Destructive."
      footer={
        <Button
          type="submit"
          form="restore-pitr"
          variant="destructive"
          disabled={pending || confirmName !== projectName || !targetAt}
        >
          Restore to time
        </Button>
      }
    >
      <form
        id="restore-pitr"
        className="space-y-3"
        onSubmit={(e) => void restorePitr(e)}
      >
        <div className="space-y-1.5">
          <Label htmlFor="target-at">Target time (local)</Label>
          <Input
            id="target-at"
            type="datetime-local"
            value={targetAt}
            onChange={(e) => setTargetAt(e.target.value)}
            max={
              pitr.windowEnd
                ? new Date(pitr.windowEnd).toISOString().slice(0, 16)
                : undefined
            }
            min={
              pitr.windowStart
                ? new Date(pitr.windowStart).toISOString().slice(0, 16)
                : undefined
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-pitr">Project name</Label>
          <Input
            id="confirm-pitr"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={projectName}
          />
        </div>
      </form>
    </ActionDialog>
  )
}
