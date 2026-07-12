import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  PREVIEW_HOSTNAME_PREFIX,
  assertProductionSlug,
  previewHostname,
  productionHostname,
  productionPublicUrl,
  slugCollidesWithPreviewPrefix,
} from "./proxy-hostname"
import { ProxyService } from "./proxy.service"

describe("proxy hostname naming", () => {
  it("builds production host and public URL from slug + base domain", () => {
    expect(productionHostname("myapp", "apps.example.com")).toBe(
      "myapp.apps.example.com",
    )
    expect(productionPublicUrl("myapp", "apps.example.com")).toBe(
      "https://myapp.apps.example.com",
    )
    expect(
      productionPublicUrl("myapp", "apps.example.com", { protocol: "http" }),
    ).toBe("http://myapp.apps.example.com")
  })

  it("reserves preview prefix so production slugs do not collide", () => {
    expect(PREVIEW_HOSTNAME_PREFIX).toBe("pr-")
    expect(slugCollidesWithPreviewPrefix("pr-42")).toBe(true)
    expect(slugCollidesWithPreviewPrefix("myapp")).toBe(false)
    expect(() => assertProductionSlug("pr-evil")).toThrow(/preview/)
    expect(() => assertProductionSlug("myapp")).not.toThrow()
  })

  it("preview hostnames use reserved scheme without colliding with prod", () => {
    const preview = previewHostname("myapp", "42", "apps.example.com")
    expect(preview).toBe("pr-42-myapp.apps.example.com")
    const prod = productionHostname("myapp", "apps.example.com")
    expect(preview).not.toBe(prod)
    expect(preview.startsWith(PREVIEW_HOSTNAME_PREFIX)).toBe(true)
  })
})

describe("ProxyService route files", () => {
  let dir: string
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it("writes a Caddy host matcher for production slug and never data-plane ports", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "deplow-proxy-"))
    const onChange = vi.fn<() => Promise<void>>(async () => undefined)
    const proxy = new ProxyService({
      routesDir: dir,
      baseDomain: "apps.example.com",
      onChange,
    })
    const route = await proxy.upsertProductionRoute({
      projectId: "proj-abc",
      slug: "demo",
      upstream: "deplow-deadbeef-app:80",
    })
    expect(route.hostname).toBe("demo.apps.example.com")
    expect(route.hostnames).toEqual(["demo.apps.example.com"])
    expect(route.publicUrl).toBe("https://demo.apps.example.com")
    expect(route.upstream).toBe("http://deplow-deadbeef-app:80")
    expect(onChange).toHaveBeenCalledTimes(1)

    const files = proxy.listRoutes()
    expect(files).toHaveLength(1)
    const content = readFileSync(path.join(dir, "proj-abc.caddy"), "utf8")
    expect(content).toContain("host demo.apps.example.com")
    expect(content).toContain("reverse_proxy http://deplow-deadbeef-app:80")
    expect(content).not.toContain("5432")
    expect(content).not.toContain("6379")
    expect(content).not.toContain("postgres")
    expect(content).not.toContain("redis")
  })

  it("removes route files on destroy and invokes onChange (caddy reload)", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "deplow-proxy-"))
    const onChange = vi.fn<() => Promise<void>>(async () => undefined)
    const proxy = new ProxyService({
      routesDir: dir,
      baseDomain: "apps.example.com",
      onChange,
    })
    await proxy.upsertProductionRoute({
      projectId: "p1",
      slug: "x",
      upstream: "c:80",
    })
    await proxy.removeProjectRoute("p1")
    expect(proxy.listRoutes()).toHaveLength(0)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it("exposes primary vs named web hostnames under base domain", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "deplow-proxy-"))
    const proxy = new ProxyService({
      routesDir: dir,
      baseDomain: "apps.kilr.dk",
      publicProtocol: "https",
    })
    expect(proxy.baseDomainConfigured).toBe(true)
    expect(proxy.configuredBaseDomain).toBe("apps.kilr.dk")
    expect(proxy.publicUrlForService("acme", "web", true)).toBe(
      "https://acme.apps.kilr.dk",
    )
    expect(proxy.publicUrlForService("acme", "api", false)).toBe(
      "https://acme-api.apps.kilr.dk",
    )
  })

  it("writes multi-host Caddy matcher when hostnames provided", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "deplow-proxy-"))
    const proxy = new ProxyService({
      routesDir: dir,
      baseDomain: "apps.example.com",
    })
    await proxy.upsertProductionRoute({
      projectId: "svc1",
      slug: "demo",
      upstream: "c:80",
      hostnames: ["demo.apps.example.com", "www.customer.com"],
    })
    const content = readFileSync(path.join(dir, "svc1.caddy"), "utf8")
    expect(content).toContain(
      "host demo.apps.example.com www.customer.com",
    )
  })
})
