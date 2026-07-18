/**
 * Map raw deploy/provision/runtime errors to short, actionable operator copy.
 * Pure — no React / oRPC imports.
 */

const PATTERNS: Array<{ re: RegExp; message: string }> = [
  {
    re: /gVisor RuntimeClass|RuntimeClass "gvisor"|handler runsc/i,
    message:
      "gVisor is not available on the cluster. Install runsc on every k3s node (scripts/install-gvisor-k3s.sh) — see docs/secure-runtime.md. Escape hatch: DEPLOW_APP_RUNTIME=runc.",
  },
  {
    re: /gVisor runtime|runsc.*not installed|runtime "runsc"/i,
    message:
      "gVisor (runsc) is not installed. On k3s: scripts/install-gvisor-k3s.sh. Legacy Docker: install runsc and restart the daemon. See docs/secure-runtime.md. Escape hatch: DEPLOW_APP_RUNTIME=runc.",
  },
  {
    re: /is not available on this host|runtime ".*?" is not available|RuntimeClass ".*?" is not available/i,
    message:
      "Configured container runtime is missing. Install it on cluster nodes or set DEPLOW_APP_RUNTIME=runc temporarily.",
  },
  {
    re: /docker build failed|railpack.*failed|build failed/i,
    message:
      "Build failed. Open deploy logs for the compiler output, fix the app, then Retry.",
  },
  {
    re: /source path does not exist|ENOENT|no such file/i,
    message:
      "Source path was not found on this host. Use an absolute path to your app directory.",
  },
  {
    re: /Local image not found|pull access denied|manifest unknown|not found/i,
    message:
      "Image could not be pulled or loaded. Check the image name, registry access, and build output.",
  },
  {
    re: /Invalid webhook signature|Invalid signature/i,
    message:
      "Webhook signature did not match. Re-copy the secret into GitHub/GitLab and try again.",
  },
  {
    re: /Connect a Git repository|No repo URL|git not connected/i,
    message:
      "Connect a GitHub or GitLab repository under Settings · Source, then Deploy.",
  },
  {
    re: /No online agent nodes|Agent node is offline|Multiple agent nodes|No connected k3s cluster|Docker-agent deploy is retired|Legacy agent nodes/i,
    message:
      "Connect a k3s cluster under Settings → Cluster (paste kubeconfig or create on Hetzner), then retry. Apps do not run on Docker agents.",
  },
  {
    re: /deploy already in progress|another deploy is running/i,
    message:
      "A deploy is already running for this project. Wait for it to finish, then retry.",
  },
  {
    re: /ECONNREFUSED|connect ECONNREFUSED/i,
    message:
      "Could not reach a platform service. Check Redis/Caddy and your S3 backend (MinIO or R2).",
  },
  {
    re: /Missing required environment variable|secrets key|BETTER_AUTH_SECRET|DEPLOW_SECRETS_KEY/i,
    message:
      "Auth or secrets encryption key is missing. Set BETTER_AUTH_SECRET and DEPLOW_SECRETS_KEY.",
  },
  {
    re: /webhook body too large|payload too large/i,
    message:
      "Webhook body was too large. Check the Git provider delivery payload size.",
  },
]

/**
 * Produce a single-line human summary for UI alerts.
 * Falls back to a truncated raw message when no pattern matches.
 */
export function summarizeDeployError(
  raw: string | null | undefined,
  options?: { maxLength?: number },
): string {
  const text = (raw ?? "").trim()
  if (!text) return "Something went wrong. Open logs for details."

  for (const { re, message } of PATTERNS) {
    if (re.test(text)) return message
  }

  // Prefer marked error lines from build dumps over leading noise
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const marked = lines.find((l) => l.includes("❌") || l.includes("⚠️"))
  const firstLine = (
    marked
      ?.replace(/^❌\s*/, "")
      .replace(/^⚠️\s*/, "")
      .trim() ||
    lines.find((l) => /^(Error\b|error:)/i.test(l)) ||
    lines[0] ||
    text
  ).trim()
  const max = options?.maxLength ?? 220
  if (firstLine.length <= max) return firstLine
  return `${firstLine.slice(0, max - 1)}…`
}

/** True when the error is an expected operator-actionable failure (not a 500 mystery). */
export function isExpectedDeployFailure(
  raw: string | null | undefined,
): boolean {
  const text = (raw ?? "").trim()
  if (!text) return false
  return PATTERNS.some(({ re }) => re.test(text))
}
