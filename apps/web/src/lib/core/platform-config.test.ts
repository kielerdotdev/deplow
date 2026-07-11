import { afterEach, describe, expect, it } from "vitest"

import { loadPlatformConfig } from "./platform-config"

const original = { ...process.env }

afterEach(() => {
  process.env = { ...original }
})

describe("loadPlatformConfig runtime + edge", () => {
  it("defaults app runtime to runsc with limits and docker-network hosts", () => {
    delete process.env.DEPLOW_APP_RUNTIME
    delete process.env.DEPLOW_APP_RUNTIME_REQUIRED
    delete process.env.DEPLOW_BASE_DOMAIN
    delete process.env.DEPLOW_PUBLIC_URL_PROTOCOL
    process.env.NODE_ENV = "test"
    const cfg = loadPlatformConfig()
    expect(cfg.appRuntime).toBe("runsc")
    expect(cfg.appRuntimeRequired).toBe(true)
    expect(cfg.appMemoryBytes).toBe(512 * 1024 * 1024)
    expect(cfg.appNanoCpus).toBe(1_000_000_000)
    expect(cfg.postgresDockerHost).toBe("postgres")
    expect(cfg.redisDockerHost).toBe("redis")
    expect(cfg.minioDockerEndpoint).toContain("minio")
    expect(cfg.baseDomain).toBe("")
  })

  it("defaults base domain + http in development", () => {
    delete process.env.DEPLOW_BASE_DOMAIN
    delete process.env.DEPLOW_PUBLIC_URL_PROTOCOL
    process.env.NODE_ENV = "development"
    const cfg = loadPlatformConfig()
    expect(cfg.baseDomain).toBe("apps.localhost")
    expect(cfg.publicUrlProtocol).toBe("http")
  })

  it("reads base domain and runtime overrides from env", () => {
    process.env.DEPLOW_APP_RUNTIME = "runc"
    process.env.DEPLOW_APP_RUNTIME_REQUIRED = "false"
    process.env.DEPLOW_BASE_DOMAIN = "apps.example.com"
    process.env.DEPLOW_PUBLIC_URL_PROTOCOL = "https"
    process.env.DEPLOW_APP_MEMORY_MB = "256"
    process.env.DEPLOW_APP_CPUS = "0.5"
    const cfg = loadPlatformConfig()
    expect(cfg.appRuntime).toBe("runc")
    expect(cfg.appRuntimeRequired).toBe(false)
    expect(cfg.baseDomain).toBe("apps.example.com")
    expect(cfg.publicUrlProtocol).toBe("https")
    expect(cfg.appMemoryBytes).toBe(256 * 1024 * 1024)
    expect(cfg.appNanoCpus).toBe(500_000_000)
  })
})
