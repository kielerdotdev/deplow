/**
 * Capture marketing screenshots from a running hostrig control plane.
 *
 * Requires: web on BASE_URL (default http://localhost:3000) + infra up.
 *
 *   pnpm screenshots
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT_DIR = path.join(ROOT, "apps/site/public/screenshots")
const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const EMAIL = process.env.SCREENSHOT_EMAIL ?? "marketing@hostrig.local"
const PASS = process.env.SCREENSHOT_PASSWORD ?? "marketing-screenshots-1"
const PROJECT_NAME = process.env.SCREENSHOT_PROJECT ?? "acme-shop"

const cookieJar = new Map()

function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? []
  for (const line of raw) {
    const [pair] = line.split(";")
    const eq = pair.indexOf("=")
    if (eq === -1) continue
    cookieJar.set(pair.slice(0, eq), pair.slice(eq + 1))
  }
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
}

async function api(pathname, body, { method = "POST", auth = true } = {}) {
  const headers = {
    "Content-Type": "application/json",
    Origin: BASE,
  }
  if (auth && cookieJar.size) headers.Cookie = cookieHeader()
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  storeCookies(res)
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`${pathname} → ${res.status}: ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(`${pathname} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return json
}

async function rpc(pathName, payload = {}) {
  const json = await api(`/api/rpc/${pathName}`, { json: payload })
  return json.json
}

async function ensureSession() {
  try {
    await api("/api/auth/sign-in/email", {
      email: EMAIL,
      password: PASS,
    })
  } catch {
    await api("/api/auth/sign-up/email", {
      name: "Marketing",
      email: EMAIL,
      password: PASS,
    })
  }
}

async function waitServiceRunning(serviceId, label, attempts = 45) {
  for (let i = 0; i < attempts; i++) {
    const svc = await rpc("services/get", { id: serviceId })
    if (svc.status === "running" || svc.status === "ready") return svc
    if (svc.status === "error") {
      console.warn(`${label} provision failed — continuing`, svc.errorMessage)
      return svc
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.warn(`${label} still not running — capturing UI anyway`)
  return rpc("services/get", { id: serviceId })
}

async function ensureDemoProject() {
  await rpc("nodes/ensureLocal")
  try {
    await rpc("platform/ingressUpdate", {
      baseDomain: "apps.localhost",
      publicProtocol: "http",
      autoDomainsEnabled: true,
    })
  } catch {
    /* optional if not admin / already set */
  }

  const listed = await rpc("projects/list")
  const projects = Array.isArray(listed) ? listed : (listed.projects ?? [])
  let project = projects.find(
    (p) => p.name === PROJECT_NAME || p.slug === PROJECT_NAME,
  )

  if (!project) {
    project = await rpc("projects/create", { name: PROJECT_NAME })
  }

  const full = await rpc("projects/get", { id: project.id })
  const services = full.services ?? []
  const byType = (type) => services.find((s) => s.type === type)

  let pg = byType("postgres")
  if (!pg) {
    pg = await rpc("services/create", {
      projectId: project.id,
      name: "postgres",
      type: "postgres",
    })
  }

  let redis = byType("redis")
  if (!redis) {
    redis = await rpc("services/create", {
      projectId: project.id,
      name: "redis",
      type: "redis",
    })
  }

  let web = byType("web")
  if (!web) {
    web = await rpc("services/create", {
      projectId: project.id,
      name: "web",
      type: "web",
      containerPort: 5678,
    })
  }

  let worker = services.find((s) => s.type === "worker" || s.name === "worker")
  if (!worker) {
    try {
      worker = await rpc("services/create", {
        projectId: project.id,
        name: "worker",
        type: "worker",
      })
    } catch {
      /* worker type may require extra fields */
    }
  }

  console.log("Waiting for data services…")
  await waitServiceRunning(pg.id, "postgres")
  await waitServiceRunning(redis.id, "redis")

  try {
    await rpc("bindings/create", {
      consumerServiceId: web.id,
      providerServiceId: pg.id,
      envKey: "DATABASE_URL",
    })
  } catch {
    /* already bound */
  }
  try {
    await rpc("bindings/create", {
      consumerServiceId: web.id,
      providerServiceId: redis.id,
      envKey: "REDIS_URL",
    })
  } catch {
    /* already bound */
  }

  // Deploy a small image so the web service looks alive (best-effort)
  try {
    const deploys = await rpc("deployments/list", { projectId: project.id })
    const deployList = Array.isArray(deploys) ? deploys : (deploys.items ?? [])
    const hasRunning = deployList.some((d) => d.status === "running")
    if (!hasRunning) {
      console.log("Deploying demo web image…")
      const deploy = await rpc("deployments/create", {
        projectId: project.id,
        serviceId: web.id,
        image: "hashicorp/http-echo:1.0",
        options: {
          image: "hashicorp/http-echo:1.0",
          containerPort: 5678,
          command: ["-text=hostrig", "-listen=:5678"],
        },
      })
      for (let i = 0; i < 60; i++) {
        const d = await rpc("deployments/get", { id: deploy.id })
        if (d.status === "running") break
        if (d.status === "failed" || d.status === "stopped") {
          console.warn(
            "Deploy ended as",
            d.status,
            "— continuing with screenshot",
          )
          break
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  } catch (err) {
    console.warn("Deploy skipped:", err instanceof Error ? err.message : err)
  }

  return project.id
}

async function capture(projectId) {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  // Reuse API session cookies in the browser
  const cookies = [...cookieJar.entries()].map(([name, value]) => ({
    name,
    value,
    url: BASE,
  }))
  await context.addCookies(cookies)

  await page.goto(`${BASE}/projects/${projectId}`, {
    waitUntil: "load",
    timeout: 60_000,
  })
  await page.waitForSelector(".topology-board", { timeout: 30_000 })
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    document
      .querySelectorAll("[data-sonner-toaster], [role='alertdialog']")
      .forEach((el) => el.remove())
  })

  const dashboardPath = path.join(OUT_DIR, "dashboard.jpeg")
  await page.screenshot({
    path: dashboardPath,
    type: "jpeg",
    quality: 92,
    animations: "disabled",
  })
  console.log("Wrote", dashboardPath)

  // Home / projects list as a second shot
  await page.goto(`${BASE}/`, { waitUntil: "load" })
  await page.waitForTimeout(800)
  const homePath = path.join(OUT_DIR, "home.jpeg")
  await page.screenshot({
    path: homePath,
    type: "jpeg",
    quality: 92,
    animations: "disabled",
  })
  console.log("Wrote", homePath)

  await browser.close()

  // Tiny manifest for the site build / humans
  await writeFile(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl: BASE,
        projectId,
        files: ["dashboard.jpeg", "home.jpeg"],
      },
      null,
      2,
    ) + "\n",
  )
}

async function main() {
  console.log("Base URL:", BASE)
  await ensureSession()
  const projectId = await ensureDemoProject()
  console.log("Project:", projectId)
  await capture(projectId)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
