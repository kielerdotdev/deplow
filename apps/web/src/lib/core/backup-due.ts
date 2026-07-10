/**
 * Durable backup due logic based on persisted lastBackupAt + interval.
 * Survives process restart — unlike pure setInterval wall-clock alone.
 */

export interface BackupDueInput {
  /** Last successful backup time (from DB); null/undefined = never backed up */
  lastBackupAt: Date | string | number | null | undefined
  /** Schedule interval in ms */
  intervalMs: number
  /** Clock override for tests */
  now?: Date | number
}

/**
 * Returns true when a scheduled backup should run now.
 * - Never backed up → due immediately (first schedule tick after create)
 * - intervalMs <= 0 → never due (disabled)
 */
export function isBackupDue(input: BackupDueInput): boolean {
  const interval = input.intervalMs
  if (!Number.isFinite(interval) || interval <= 0) return false

  const nowMs =
    input.now instanceof Date
      ? input.now.getTime()
      : typeof input.now === "number"
        ? input.now
        : Date.now()

  if (input.lastBackupAt == null || input.lastBackupAt === "") {
    return true
  }

  const lastMs =
    input.lastBackupAt instanceof Date
      ? input.lastBackupAt.getTime()
      : typeof input.lastBackupAt === "number"
        ? input.lastBackupAt
        : new Date(input.lastBackupAt).getTime()

  if (!Number.isFinite(lastMs)) return true
  return nowMs - lastMs >= interval
}

/** Next due timestamp (ms) for UI/schedule display */
export function nextBackupDueAt(input: BackupDueInput): number | null {
  const interval = input.intervalMs
  if (!Number.isFinite(interval) || interval <= 0) return null

  const nowMs =
    input.now instanceof Date
      ? input.now.getTime()
      : typeof input.now === "number"
        ? input.now
        : Date.now()

  if (input.lastBackupAt == null || input.lastBackupAt === "") {
    return nowMs
  }

  const lastMs =
    input.lastBackupAt instanceof Date
      ? input.lastBackupAt.getTime()
      : typeof input.lastBackupAt === "number"
        ? input.lastBackupAt
        : new Date(input.lastBackupAt).getTime()

  if (!Number.isFinite(lastMs)) return nowMs
  return lastMs + interval
}
