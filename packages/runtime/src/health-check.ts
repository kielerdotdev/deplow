/**
 * Post-deploy health checks for web (port + optional HTTP) and workers (stability).
 */

export type HealthCheckInput = {
  serviceType: "web" | "worker"
  expectedPort: number
  healthCheckPath?: string | null
  /** Container logs for actionable hints */
  logs?: string
  /** Poll helpers — injectable for tests */
  isPortListening: () => Promise<boolean>
  /** Optional: detect another port the process may be bound to */
  detectListeningPort?: () => Promise<number | null>
  httpGet?: (path: string) => Promise<{ ok: boolean; status: number }>
  isProcessStable: () => Promise<boolean>
  /** Max wait for web port / worker stability */
  timeoutMs?: number
  intervalMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export type HealthCheckResult = { ok: true } | { ok: false; message: string }

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_INTERVAL_MS = 1_500

export async function waitForServiceHealth(
  input: HealthCheckInput,
): Promise<HealthCheckResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const intervalMs = input.intervalMs ?? DEFAULT_INTERVAL_MS
  const now = input.now ?? Date.now
  const sleep =
    input.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const deadline = now() + timeoutMs

  if (input.serviceType === "worker") {
    while (now() < deadline) {
      if (await input.isProcessStable()) {
        // Require stability across one extra interval
        await sleep(intervalMs)
        if (await input.isProcessStable()) {
          return { ok: true }
        }
      }
      await sleep(intervalMs)
    }
    return {
      ok: false,
      message:
        "Worker process did not stay running—check start command and logs.",
    }
  }

  // Web: wait for expected port
  let portUp = false
  while (now() < deadline) {
    if (await input.isPortListening()) {
      portUp = true
      break
    }
    await sleep(intervalMs)
  }

  if (!portUp) {
    const other = input.detectListeningPort
      ? await input.detectListeningPort()
      : null
    if (other != null && other !== input.expectedPort) {
      return {
        ok: false,
        message: `App listens on port ${other} but port ${input.expectedPort} was expected.`,
      }
    }
    const logs = input.logs ?? ""
    // Astro/Vite print "Local http://localhost" even when bound to 0.0.0.0 —
    // only warn when logs clearly say the server bound to loopback only.
    if (
      /(?:listening|bound|serving).*?(?:127\.0\.0\.1|localhost)/i.test(logs) &&
      !(/0\.0\.0\.0|::\s|Network\s+http/i.test(logs))
    ) {
      return {
        ok: false,
        message: "Bind the application to 0.0.0.0 instead of localhost.",
      }
    }
    const hinted = extractPortFromLogs(logs)
    if (hinted != null && hinted !== input.expectedPort) {
      return {
        ok: false,
        message: `App listens on port ${hinted} but port ${input.expectedPort} was expected.`,
      }
    }
    return {
      ok: false,
      message: `Expected port ${input.expectedPort} is not listening. Ensure the app binds to 0.0.0.0 and uses process.env.PORT.`,
    }
  }

  const healthPath = input.healthCheckPath?.trim()
  if (healthPath && input.httpGet) {
    const path = healthPath.startsWith("/") ? healthPath : `/${healthPath}`
    while (now() < deadline) {
      try {
        const res = await input.httpGet(path)
        if (res.ok || (res.status >= 200 && res.status < 500)) {
          return { ok: true }
        }
      } catch {
        // retry
      }
      await sleep(intervalMs)
    }
    return {
      ok: false,
      message: `Health-check path ${path} did not respond successfully.`,
    }
  }

  return { ok: true }
}

export function extractPortFromLogs(logs: string): number | null {
  const patterns = [
    /listening on(?: port)?[:\s]+(\d{2,5})/i,
    /bound to.*?:(\d{2,5})/i,
    /server.*?(?:port|:)[\s]*(\d{2,5})/i,
    /PORT[=:\s]+(\d{2,5})/i,
  ]
  for (const re of patterns) {
    const m = logs.match(re)
    if (m?.[1]) {
      const n = Number(m[1])
      if (n > 0 && n <= 65_535) return n
    }
  }
  return null
}

export function formatHealthError(message: string): string {
  return message
}
