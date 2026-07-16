/**
 * Lightweight filter expression parser for Explorer autocomplete.
 *
 * Supports:
 *   service.name = 'frontend'
 *   http.status_code >= 500
 *   status = 'error' AND deployment.environment = 'production'
 *   service EXISTS
 *   body CONTAINS 'timeout'
 */

export type ExprFilterOp =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "exists"
  | "not_exists"
  | "gt"
  | "gte"
  | "lt"
  | "lte"

export type ExprFilterClause = {
  key: string
  op: ExprFilterOp
  value?: string
}

export type ExprFilterGroup = {
  id: string
  mode: "and" | "or" | "not"
  clauses: ExprFilterClause[]
  groups: ExprFilterGroup[]
}

const OP_MAP: Record<string, ExprFilterOp> = {
  "=": "eq",
  "==": "eq",
  "!=": "neq",
  "<>": "neq",
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
  CONTAINS: "contains",
  "NOT CONTAINS": "not_contains",
  EXISTS: "exists",
  "NOT EXISTS": "not_exists",
}

export type ParseExpressionResult =
  | { ok: true; group: ExprFilterGroup }
  | { ok: false; error: string }

function stripQuotes(v: string): string {
  const t = v.trim()
  if (
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('"') && t.endsWith('"'))
  ) {
    return t.slice(1, -1)
  }
  return t
}

function parseClause(raw: string): ExprFilterClause | null {
  const s = raw.trim()
  if (!s) return null

  const exists = s.match(/^([a-zA-Z0-9_./:-]+)\s+(NOT\s+)?EXISTS$/i)
  if (exists) {
    return {
      key: exists[1]!,
      op: exists[2] ? "not_exists" : "exists",
    }
  }

  const m = s.match(
    /^([a-zA-Z0-9_./:-]+)\s*(=|==|!=|<>|>=|<=|>|<|CONTAINS|NOT\s+CONTAINS)\s*(.+)$/i,
  )
  if (!m) return null

  const key = m[1]!
  const opRaw = m[2]!.replace(/\s+/g, " ").toUpperCase()
  const op = OP_MAP[opRaw] ?? OP_MAP[m[2]!]
  if (!op) return null
  const value = stripQuotes(m[3]!)
  return { key, op, value }
}

/** Parse AND-joined filter expression into a filter group. */
export function parseFilterExpression(input: string): ParseExpressionResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return {
      ok: true,
      group: { id: "root", mode: "and", clauses: [], groups: [] },
    }
  }

  // Split on AND / and outside quotes
  const parts: string[] = []
  let buf = ""
  let quote: "'" | '"' | null = null
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!
    if (quote) {
      buf += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      buf += ch
      continue
    }
    if (/^\s+AND\s+/i.test(trimmed.slice(i))) {
      parts.push(buf.trim())
      buf = ""
      const match = trimmed.slice(i).match(/^\s+AND\s+/i)!
      i += match[0].length - 1
      continue
    }
    buf += ch
  }
  if (buf.trim()) parts.push(buf.trim())

  const clauses: ExprFilterClause[] = []
  for (const part of parts) {
    const clause = parseClause(part)
    if (!clause) {
      return {
        ok: false,
        error: `Could not parse filter: ${part}`,
      }
    }
    clauses.push(clause)
  }

  return {
    ok: true,
    group: { id: "root", mode: "and", clauses, groups: [] },
  }
}

/** Serialize filter clauses back to expression text. */
export function serializeFilterExpression(group: {
  clauses: ExprFilterClause[]
}): string {
  const parts = group.clauses.map((c) => {
    if (c.op === "exists") return `${c.key} EXISTS`
    if (c.op === "not_exists") return `${c.key} NOT EXISTS`
    if (c.op === "contains") return `${c.key} CONTAINS '${c.value ?? ""}'`
    if (c.op === "not_contains")
      return `${c.key} NOT CONTAINS '${c.value ?? ""}'`
    const op =
      c.op === "eq"
        ? "="
        : c.op === "neq"
          ? "!="
          : c.op === "gte"
            ? ">="
            : c.op === "lte"
              ? "<="
              : c.op === "gt"
                ? ">"
                : c.op === "lt"
                  ? "<"
                  : "="
    const needsQuote = !/^-?\d+(\.\d+)?$/.test(c.value ?? "")
    const v = needsQuote ? `'${(c.value ?? "").replace(/'/g, "\\'")}'` : (c.value ?? "")
    return `${c.key} ${op} ${v}`
  })
  return parts.join(" AND ")
}
