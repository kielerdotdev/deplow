/**
 * Per-project deploy serialization.
 * Prevents concurrent UI + webhook deploys from racing into dual-running state.
 */

export class ProjectDeployLock {
  private readonly inFlight = new Map<string, Promise<unknown>>()

  isBusy(projectId: string): boolean {
    return this.inFlight.has(projectId)
  }

  /**
   * Run `fn` exclusively for `projectId`.
   * Concurrent callers for the same project get a clear error (no silent queue).
   */
  async runExclusive<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    if (this.inFlight.has(projectId)) {
      throw new Error(
        "Another deploy is running for this project. Wait for it to finish, then retry.",
      )
    }

    const work = (async () => fn())()
    this.inFlight.set(projectId, work)
    try {
      return await work
    } finally {
      // Only clear if we still own the slot (defensive)
      if (this.inFlight.get(projectId) === work) {
        this.inFlight.delete(projectId)
      }
    }
  }

  /** Test helper — force-clear all locks */
  clear(): void {
    this.inFlight.clear()
  }
}

/** Process-wide lock used by the shared production deploy pipeline */
export const projectDeployLock = new ProjectDeployLock()
