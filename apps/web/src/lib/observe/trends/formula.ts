/** Evaluate simple arithmetic formulas over series letters (A, B, …). */

const TOKEN =
  /\s*([A-Z]+|\d+(?:\.\d+)?|\+|\-|\*|\/|\(|\))\s*/gy

export function validateFormulaExpr(
  expr: string,
  letters: string[],
): { ok: true } | { ok: false; error: string } {
  const allowed = new Set(letters)
  try {
    const tokens = tokenize(expr)
    for (const t of tokens) {
      if (/^[A-Z]+$/.test(t) && !allowed.has(t)) {
        return { ok: false, error: `Unknown series ${t}` }
      }
    }
    evalExpr(tokens, Object.fromEntries(letters.map((l) => [l, 1])))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid formula" }
  }
}

export function evalFormula(
  expr: string,
  values: Record<string, number | null>,
): number | null {
  try {
    const tokens = tokenize(expr)
    return evalExpr(tokens, values)
  } catch {
    return null
  }
}

function tokenize(expr: string): string[] {
  const out: string[] = []
  TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  let last = 0
  while ((m = TOKEN.exec(expr))) {
    if (m.index !== last) throw new Error(`Unexpected token near "${expr.slice(last)}"`)
    out.push(m[1]!)
    last = TOKEN.lastIndex
  }
  if (last !== expr.length) throw new Error("Trailing junk in formula")
  if (out.length === 0) throw new Error("Empty formula")
  return out
}

function evalExpr(
  tokens: string[],
  values: Record<string, number | null>,
): number | null {
  let i = 0
  function peek() {
    return tokens[i]
  }
  function next() {
    return tokens[i++]
  }

  function parsePrimary(): number | null {
    const t = next()
    if (t === "(") {
      const v = parseAdd()
      if (next() !== ")") throw new Error("Missing )")
      return v
    }
    if (t === "-") {
      const v = parsePrimary()
      return v == null ? null : -v
    }
    if (!t) throw new Error("Unexpected end")
    if (/^[A-Z]+$/.test(t)) {
      const v = values[t]
      return v === undefined ? null : v
    }
    if (/^\d/.test(t)) return Number(t)
    throw new Error(`Unexpected ${t}`)
  }

  function parseMul(): number | null {
    let left = parsePrimary()
    while (peek() === "*" || peek() === "/") {
      const op = next()!
      const right = parsePrimary()
      if (left == null || right == null) return null
      if (op === "/" && right === 0) return null
      left = op === "*" ? left * right : left / right
    }
    return left
  }

  function parseAdd(): number | null {
    let left = parseMul()
    while (peek() === "+" || peek() === "-") {
      const op = next()!
      const right = parseMul()
      if (left == null || right == null) return null
      left = op === "+" ? left + right : left - right
    }
    return left
  }

  const result = parseAdd()
  if (i !== tokens.length) throw new Error("Unexpected trailing tokens")
  return result
}
