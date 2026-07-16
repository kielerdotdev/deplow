#!/usr/bin/env node
/**
 * Playwright UI smoke for Observe pages (requires logged-in cookie jar from e2e-observe.sh).
 */
import { readFileSync } from "node:fs"
import { chromium } from "playwright"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const PROJECT_ID = process.env.PROJECT_ID
const ISSUE_ID = process.env.ISSUE_ID
const COOKIE_JAR = process.env.COOKIE_JAR

if (!PROJECT_ID || !ISSUE_ID || !COOKIE_JAR) {
  console.error("PROJECT_ID, ISSUE_ID, COOKIE_JAR required")
  process.exit(1)
}

/** Parse curl Netscape cookie jar (supports #HttpOnly_ prefix). */
function parseNetscapeCookies(path) {
  const lines = readFileSync(path, "utf8").split("\n")
  const cookies = []
  for (const line of lines) {
    if (!line || (line.startsWith("#") && !line.startsWith("#HttpOnly_"))) {
      continue
    }
    let raw = line
    let httpOnly = false
    if (raw.startsWith("#HttpOnly_")) {
      httpOnly = true
      raw = raw.slice("#HttpOnly_".length)
    }
    const parts = raw.split("\t")
    if (parts.length < 7) continue
    const [domain, , cookiePath, secure, expires, name, value] = parts
    cookies.push({
      name,
      value: decodeURIComponent(value),
      domain: domain.startsWith(".") ? domain.slice(1) : domain,
      path: cookiePath,
      secure: secure.toUpperCase() === "TRUE",
      expires: Number(expires) > 0 ? Number(expires) : undefined,
      httpOnly,
    })
  }
  return cookies
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const url = new URL(BASE)
const jarCookies = parseNetscapeCookies(COOKIE_JAR)
await context.addCookies(
  jarCookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: url.hostname,
    path: c.path || "/",
    httpOnly: c.httpOnly,
    secure: url.protocol === "https:",
    sameSite: "Lax",
  })),
)

const page = await context.newPage()

async function assertPage(path, checks) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" })
  if (!res || res.status() >= 400) {
    throw new Error(`${path} status ${res?.status()}`)
  }
  // Wait for client hydration / mode switch
  await page.waitForSelector("text=Observe", { timeout: 15_000 })
  for (const text of checks) {
    await page.getByText(text, { exact: false }).first().waitFor({
      timeout: 15_000,
      state: "visible",
    })
  }
  console.log(`ui ok ${path}`)
}

await assertPage("/observe", ["Deploy", "Observe"])
await assertPage(`/observe/projects/${PROJECT_ID}/issues`, ["Issues"])
await assertPage(`/observe/projects/${PROJECT_ID}/setup`, ["DSN"])
await assertPage(`/observe/projects/${PROJECT_ID}/issues/${ISSUE_ID}`, [
  "Stacktrace",
  "Resolve",
])

await page.getByRole("button", { name: "Stacktrace" }).click()
// Sample envelopes use either main (generic e2e) or handler (yoyoyolo)
await page.locator('[data-testid="stack-frames"]').waitFor({ timeout: 10_000 })
const frameText = await page.locator('[data-testid="stack-frames"]').innerText()
if (!/main|handler|app\.ts|yoyoyolo/.test(frameText)) {
  throw new Error(`unexpected stack frames: ${frameText}`)
}
console.log("stack frames ok:", frameText.split("\n")[0])

await browser.close()
console.log("observe-ui-smoke: PASS")
