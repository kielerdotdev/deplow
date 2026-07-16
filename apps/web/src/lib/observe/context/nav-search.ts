/**
 * Keys that belong on every Observe list/detail navigation hop.
 * Page-local keys (event, span, log, status, inspect, tq) are stripped.
 */
const FORWARD_KEYS = [
  "t",
  "from",
  "to",
  "bl",
  "blFrom",
  "blTo",
  "f",
  "q",
  "svc",
  "op",
  "tid",
  "sid",
  "rel",
  "env",
  "scope",
  "err",
  "dmin",
  "sel",
  "tab",
] as const

const FORWARD_SET = new Set<string>(FORWARD_KEYS)

/** Pick Observe Context search params safe to forward across pages. */
export function pickObserveNavSearch(
  search: Record<string, unknown> | undefined | null,
): Record<string, string> {
  if (!search) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(search)) {
    if (!FORWARD_SET.has(key)) continue
    if (typeof value === "string" && value !== "") {
      out[key] = value
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = String(value)
    } else if (typeof value === "boolean") {
      out[key] = value ? "1" : "0"
    }
  }
  return out
}
