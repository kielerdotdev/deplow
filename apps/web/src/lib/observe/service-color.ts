/** Deterministic categorical service colors (Observe-local; not Deploy brand). */
const SERVICE_COLORS = [
  "oklch(0.68 0.17 250)",
  "oklch(0.65 0.12 185)",
  "oklch(0.65 0.15 155)",
  "oklch(0.65 0.15 130)",
  "oklch(0.7 0.14 90)",
  "oklch(0.7 0.16 60)",
  "oklch(0.65 0.15 45)",
  "oklch(0.65 0.18 25)",
  "oklch(0.62 0.16 0)",
  "oklch(0.62 0.14 340)",
  "oklch(0.6 0.14 320)",
  "oklch(0.62 0.14 290)",
  "oklch(0.62 0.16 270)",
  "oklch(0.64 0.16 260)",
  "oklch(0.65 0.13 210)",
  "oklch(0.6 0.1 230)",
] as const

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  }
  return h
}

export function getServiceColor(serviceName: string): string {
  if (!serviceName) return SERVICE_COLORS[0]
  return SERVICE_COLORS[hashName(serviceName) % SERVICE_COLORS.length]!
}

export function serviceColorMap(
  names: ReadonlyArray<string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of names) out[name] = getServiceColor(name)
  return out
}
