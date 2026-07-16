export async function pingClickHouse(cfg) {
  const { url, headers } = clickhouseRequest(cfg, null, { ping: true })
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`ClickHouse ping failed: ${res.status}`)
}

export async function insertJson(cfg, table, rows) {
  if (!rows.length) return 0
  const body = rows.map((r) => JSON.stringify(r)).join("\n")
  const { url, headers } = clickhouseRequest(
    cfg,
    `INSERT INTO ${cfg.chDb}.${table} FORMAT JSONEachRow`,
  )
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: `${body}\n`,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ClickHouse insert ${table} failed (${res.status}): ${text}`)
  }
  return rows.length
}

function clickhouseRequest(cfg, query, opts = {}) {
  const parsed = new URL(cfg.chUrl)
  const user = decodeURIComponent(parsed.username || "default")
  const pass = decodeURIComponent(parsed.password || "")
  parsed.username = ""
  parsed.password = ""
  if (opts.ping) {
    parsed.pathname = "/ping"
    parsed.search = ""
  } else if (query) {
    parsed.pathname = "/"
    parsed.search = ""
    parsed.searchParams.set("query", query)
  }
  const headers = {}
  if (user) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`
  }
  return { url: parsed, headers }
}
