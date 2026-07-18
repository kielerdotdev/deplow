/**
 * Outbound HTTP(S) with DNS resolution check + connect to resolved address.
 * Mitigates classic DNS-rebinding SSRF where a public name later points private.
 */

import dns from "node:dns/promises"
import http from "node:http"
import https from "node:https"
import type { IncomingMessage } from "node:http"
import { isIP } from "node:net"

import {
  assertSafeOutboundUrl,
  isPrivateOrLocalHost,
  type OutboundUrlPolicy,
} from "./safe-url"

export type SafeFetchInit = {
  method?: string
  headers?: Record<string, string>
  body?: string | Buffer
  /** Abort after this many ms (default 8000). */
  timeoutMs?: number
  policy?: OutboundUrlPolicy
}

export type SafeFetchResult = {
  status: number
  ok: boolean
  headers: Headers
  body: Buffer
}

function collectBody(res: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    res.on("data", (c: Buffer) => chunks.push(c))
    res.on("end", () => resolve(Buffer.concat(chunks)))
    res.on("error", reject)
  })
}

/**
 * Resolve hostname and ensure every A/AAAA record is non-private.
 * Returns addresses suitable for connecting.
 */
export async function resolvePublicAddresses(
  hostname: string,
): Promise<string[]> {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "")
  if (isIP(host)) {
    if (isPrivateOrLocalHost(host)) {
      throw new Error("URL must not target private or local network addresses")
    }
    return [host]
  }
  if (isPrivateOrLocalHost(host)) {
    throw new Error("URL must not target private or local network addresses")
  }

  let records: dns.LookupAddress[]
  try {
    records = await dns.lookup(host, { all: true, verbatim: true })
  } catch {
    throw new Error("Could not resolve hostname")
  }
  if (!records.length) {
    throw new Error("Hostname resolved to no addresses")
  }
  const addrs: string[] = []
  for (const r of records) {
    if (isPrivateOrLocalHost(r.address)) {
      throw new Error(
        "Hostname resolves to a private or local network address",
      )
    }
    addrs.push(r.address)
  }
  return addrs
}

/**
 * POST/GET/etc. to an outbound URL after validating scheme/host and
 * resolving DNS to public IPs only. Connects to a resolved IP with
 * Host/SNI set to the original hostname (TLS pin).
 */
export async function safeOutboundFetch(
  rawUrl: string,
  init: SafeFetchInit = {},
): Promise<SafeFetchResult> {
  const u = assertSafeOutboundUrl(rawUrl, init.policy)
  const addrs = await resolvePublicAddresses(u.hostname)
  const ip = addrs[0]!
  const isHttps = u.protocol === "https:"
  const port = u.port
    ? Number(u.port)
    : isHttps
      ? 443
      : 80
  const path = `${u.pathname || "/"}${u.search || ""}`
  const method = (init.method ?? "GET").toUpperCase()
  const timeoutMs = init.timeoutMs ?? 8_000

  const headers: Record<string, string> = {
    Host: u.host,
    ...(init.headers ?? {}),
  }
  if (init.body != null && !headers["Content-Length"] && !headers["content-length"]) {
    headers["Content-Length"] = String(Buffer.byteLength(init.body))
  }

  const lib = isHttps ? https : http

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: isHttps ? "https:" : "http:",
        hostname: ip,
        port,
        path,
        method,
        headers,
        // TLS: present the original hostname for cert verification / SNI
        servername: isHttps ? u.hostname : undefined,
        // Do not follow redirects (caller should re-validate if ever needed)
        setHost: false,
      },
      (res) => {
        void collectBody(res)
          .then((body) => {
            const status = res.statusCode ?? 0
            const outHeaders = new Headers()
            for (const [k, v] of Object.entries(res.headers)) {
              if (v == null) continue
              if (Array.isArray(v)) outHeaders.set(k, v.join(", "))
              else outHeaders.set(k, v)
            }
            resolve({
              status,
              ok: status >= 200 && status < 300,
              headers: outHeaders,
              body,
            })
          })
          .catch(reject)
      },
    )
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`))
    })
    req.on("error", reject)
    if (init.body != null) req.write(init.body)
    req.end()
  })
}
