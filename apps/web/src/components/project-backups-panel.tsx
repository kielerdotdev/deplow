import { DatabaseBackupIcon } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime } from "@/lib/ui-format"

export function BackupsPanel({
  schedule,
  backups,
  pending,
  onRun,
}: {
  schedule: {
    intervalMs: number
    scheduled: boolean
    lastBackupAt?: string | null
  }
  backups: {
    id: string
    status: string
    storageKey: string
    sizeBytes?: number | null
    errorMessage?: string | null
  }[]
  pending: boolean
  onRun: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Postgres backups</CardTitle>
        <CardDescription>
          On-demand dumps and the scheduled interval (default daily). Due times
          use last successful backup from the database.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Interval</p>
            <p className="font-medium">
              every {Math.round(schedule.intervalMs / 3_600_000)}h
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Scheduler</p>
            <p className="font-medium">
              {schedule.scheduled ? "Active" : "Not running"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last backup</p>
            <p className="font-medium">
              {schedule.lastBackupAt
                ? formatDateTime(schedule.lastBackupAt)
                : "None yet"}
            </p>
          </div>
        </div>

        {backups.length === 0 ? (
          <EmptyState
            size="sm"
            icon={DatabaseBackupIcon}
            title="No backups yet"
            description="Run a backup now, or wait for the schedule to create the first dump."
            action={
              <Button size="sm" disabled={pending} onClick={onRun}>
                <DatabaseBackupIcon data-icon="inline-start" />
                {pending ? "Backing up…" : "Run backup"}
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Storage key</TableHead>
                <TableHead className="text-right">Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <StatusBadge status={b.status} />
                    {b.errorMessage ? (
                      <p className="mt-1 text-xs text-destructive">
                        {b.errorMessage}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate font-mono text-xs">
                    {b.storageKey}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {b.sizeBytes ? `${b.sizeBytes} B` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {backups.length > 0 ? (
        <CardFooter>
          <Button size="sm" disabled={pending} onClick={onRun}>
            <DatabaseBackupIcon data-icon="inline-start" />
            {pending ? "Running…" : "Run Postgres backup"}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
