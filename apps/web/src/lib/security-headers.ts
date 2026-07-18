/**
 * Baseline browser security headers for the control-plane UI and APIs.
 */

const IS_PROD = process.env.NODE_ENV === "production"

/**
 * CSP tuned for TanStack Start / Vite SPA:
 * - scripts/styles may need unsafe-inline depending on framework inject
 * - connect-src allows same-origin RPC + optional observe dogfood
 */
export function contentSecurityPolicy(): string {
  const connect = ["'self'", "https:", "wss:"]
  // Dev HMR / vite
  if (!IS_PROD) {
    connect.push("ws:", "http://localhost:*", "http://127.0.0.1:*")
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // React/Vite often need inline styles; keep scripts tighter in prod
    IS_PROD
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ")
}

export function securityHeaders(
  pathname: string,
  opts?: { https?: boolean },
): Record<string, string> {
  // Observe client SDKs POST from arbitrary origins — do not force CSP on ingest.
  if (/^\/api\/\d+\/(envelope|store|otlp)(\/|$)/i.test(pathname)) {
    return {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    }
  }

  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Content-Security-Policy": contentSecurityPolicy(),
  }
  // Only advertise HSTS when the request (or public URL) is HTTPS — avoid
  // locking pure-HTTP self-hosted installs into a broken browser state.
  const publicHttps = (
    process.env.BETTER_AUTH_URL ??
    process.env.DEPLOW_PUBLIC_URL ??
    ""
  ).startsWith("https:")
  if (IS_PROD && (opts?.https || publicHttps)) {
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains"
  }
  return headers
}

/** Merge security headers onto a Response (clones headers). */
export function withSecurityHeaders(
  response: Response,
  pathname: string,
  request?: Request,
): Response {
  const https =
    request != null &&
    (new URL(request.url).protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https")
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(securityHeaders(pathname, { https }))) {
    // Do not override if route already set a stronger CSP
    if (k === "Content-Security-Policy" && headers.has(k)) continue
    headers.set(k, v)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
