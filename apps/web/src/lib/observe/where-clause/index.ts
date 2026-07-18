import type { FilterClause, FilterOp, QuerySpec } from "@/lib/observe/context"

export type WhereOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "contains"
  | "!contains"
  | "exists"
  | "!exists"

export type ParsedWhereClause = {
  key: string
  operator: WhereOperator
  value: string
}

export type WhereClauseParseWarning = {
  message: string
  clause: string
}

const KEY_ALIASES: Record<string, string> = {
  service: "service.name",
  span: "span.name",
  operation: "span.name",
  environment: "deployment.environment",
  env: "deployment.environment",
  errors_only: "has_error",
  "root.only": "root_only",
}

export function normalizeKey(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  return KEY_ALIASES[trimmed] ?? raw.trim()
}

const OP_PATTERN =
  /^(=|!=|>=|<=|>|<|contains|!contains|exists|!exists)\s*/i

function unquote(value: string): string {
  const t = value.trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1).replace(/\\(["'\\])/g, "$1")
  }
  return t
}

function quoteValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

/** Split on AND outside of quotes. */
function splitAnd(input: string): string[] {
  const parts: string[] = []
  let buf = ""
  let inQuote: '"' | "'" | null = null
  let escaped = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    if (escaped) {
      buf += ch
      escaped = false
      continue
    }
    if (ch === "\\" && inQuote) {
      buf += ch
      escaped = true
      continue
    }
    if ((ch === '"' || ch === "'") && (!inQuote || inQuote === ch)) {
      inQuote = inQuote === ch ? null : ch
      buf += ch
      continue
    }
    if (!inQuote && input.slice(i, i + 5).toUpperCase() === " AND ") {
      if (buf.trim()) parts.push(buf.trim())
      buf = ""
      i += 4
      continue
    }
    buf += ch
  }
  if (buf.trim()) parts.push(buf.trim())
  return parts
}

function parseOneClause(
  raw: string,
): ParsedWhereClause | WhereClauseParseWarning {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { message: "Empty clause", clause: raw }
  }

  // key op value | key exists | key !exists
  const keyMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s+/)
  if (!keyMatch) {
    return { message: "Missing field name", clause: raw }
  }
  const key = normalizeKey(keyMatch[1]!)
  const rest = trimmed.slice(keyMatch[0].length).trim()
  const opMatch = rest.match(OP_PATTERN)
  if (!opMatch) {
    return { message: "Unknown operator", clause: raw }
  }
  const operator = opMatch[1]!.toLowerCase() as WhereOperator
  const valueRaw = rest.slice(opMatch[0].length).trim()

  if (operator === "exists" || operator === "!exists") {
    if (valueRaw) {
      return {
        message: "exists/!exists takes no value",
        clause: raw,
      }
    }
    return { key, operator, value: "" }
  }

  if (!valueRaw) {
    return { message: "Missing value", clause: raw }
  }
  return { key, operator, value: unquote(valueRaw) }
}

export function parseWhereClause(input: string): {
  clauses: ParsedWhereClause[]
  warnings: WhereClauseParseWarning[]
} {
  const trimmed = input.trim()
  if (!trimmed) return { clauses: [], warnings: [] }

  const parts = splitAnd(trimmed)
  const clauses: ParsedWhereClause[] = []
  const warnings: WhereClauseParseWarning[] = []
  for (const part of parts) {
    const parsed = parseOneClause(part)
    if ("message" in parsed) warnings.push(parsed)
    else clauses.push(parsed)
  }
  return { clauses, warnings }
}

const OP_TO_FILTER: Record<WhereOperator, FilterOp> = {
  "=": "eq",
  "!=": "neq",
  ">": "gt",
  "<": "lt",
  ">=": "gte",
  "<=": "lte",
  contains: "contains",
  "!contains": "not_contains",
  exists: "exists",
  "!exists": "not_exists",
}

const FILTER_TO_OP: Record<FilterOp, WhereOperator> = {
  eq: "=",
  neq: "!=",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
  contains: "contains",
  not_contains: "!contains",
  exists: "exists",
  not_exists: "!exists",
}

/** Map where-clause keys onto QuerySpec dims when possible; rest become FilterClause. */
export function whereClausesToContext(clauses: ParsedWhereClause[]): {
  filters: FilterClause[]
  queryPatch: Partial<QuerySpec>
} {
  const filters: FilterClause[] = []
  const queryPatch: Partial<QuerySpec> = {}

  for (const c of clauses) {
    if (
      (c.key === "service.name" || c.key === "service") &&
      c.operator === "="
    ) {
      queryPatch.service = c.value
      continue
    }
    if (
      (c.key === "span.name" || c.key === "operation") &&
      c.operator === "="
    ) {
      queryPatch.operation = c.value
      continue
    }
    if (
      (c.key === "deployment.environment" || c.key === "environment") &&
      c.operator === "="
    ) {
      queryPatch.environment = c.value
      continue
    }
    if (c.key === "has_error" && (c.operator === "=" || c.operator === "exists")) {
      const truthy =
        c.operator === "exists" ||
        ["1", "true", "yes", "y"].includes(c.value.toLowerCase())
      if (truthy) queryPatch.errorsOnly = true
      continue
    }
    if (c.key === "duration_ms" || c.key === "duration") {
      const n = Number(c.value)
      if (
        Number.isFinite(n) &&
        (c.operator === ">" || c.operator === ">=")
      ) {
        queryPatch.minDurationMs = n
        continue
      }
    }

    // Bare unknown keys become attr.* for clarity in filter chips
    const key =
      c.key.includes(".") ||
      c.key.startsWith("attr.") ||
      c.key.startsWith("resource.")
        ? c.key
        : `attr.${c.key}`

    filters.push({
      key,
      op: OP_TO_FILTER[c.operator],
      value:
        c.operator === "exists" || c.operator === "!exists"
          ? undefined
          : c.value,
    })
  }

  return { filters, queryPatch }
}

export function contextToWhereClause(
  filters: FilterClause[],
  query: QuerySpec = {},
): string {
  const parts: string[] = []
  if (query.service) {
    parts.push(`service = ${quoteValue(query.service)}`)
  }
  if (query.operation) {
    parts.push(`span = ${quoteValue(query.operation)}`)
  }
  if (query.environment) {
    parts.push(`env = ${quoteValue(query.environment)}`)
  }
  if (query.errorsOnly) {
    parts.push(`errors_only = true`)
  }
  if (query.minDurationMs != null && query.minDurationMs > 0) {
    parts.push(`duration_ms >= ${query.minDurationMs}`)
  }
  for (const f of filters) {
    const op = FILTER_TO_OP[f.op]
    const key = f.key.replace(/^attr\./, "")
    if (f.op === "exists" || f.op === "not_exists") {
      parts.push(`${key} ${op}`)
    } else {
      parts.push(`${key} ${op} ${quoteValue(f.value ?? "")}`)
    }
  }
  return parts.join(" AND ")
}

export function applyWhereClauseToContext(
  where: string,
  base: { filters: FilterClause[]; query: QuerySpec },
): {
  filters: FilterClause[]
  query: QuerySpec
  warnings: WhereClauseParseWarning[]
} {
  const { clauses, warnings } = parseWhereClause(where)
  const { filters, queryPatch } = whereClausesToContext(clauses)
  return {
    filters,
    query: {
      ...base.query,
      service: undefined,
      operation: undefined,
      environment: undefined,
      errorsOnly: undefined,
      minDurationMs: undefined,
      ...queryPatch,
    },
    warnings,
  }
}
