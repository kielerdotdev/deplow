import { afterEach, describe, expect, it } from "vitest"

import { assertProductionSecrets, loadPlatformConfig } from "./platform-config"

const original = { ...process.env }

afterEach(() => {
  process.env = { ...original }
})

describe("loadPlatformConfig runtime + edge", () => {
  it("defaults app runtime to runsc with limits and docker-network hosts", () => {
    process.env.HOSTRIG_APP_RUNTIME = "runsc"
    process.env.HOSTRIG_APP_RUNTIME_REQUIRED = "true"
    delete process.env.HOSTRIG_BASE_DOMAIN
    delete process.env.NODE_ENV
    delete process.env.HOSTRIG_S3_PROVIDER
    const cfg = loadPlatformConfig()
    expect(cfg.appRuntime).toBe("runsc")
    expect(cfg.appRuntimeRequired).toBe(true)
    expect(cfg.appMemoryBytes).toBe(512 * 1024 * 1024)
    expect(cfg.appNanoCpus).toBe(1_000_000_000)
    expect(cfg.postgresDockerHost).toBe("postgres")
    expect(cfg.redisDockerHost).toBe("redis")
    expect(cfg.s3.provider).toBe("minio")
    expect(cfg.s3.endpoint).toContain("127.0.0.1")
  })

  it("resolves R2 from account id", () => {
    process.env.HOSTRIG_S3_PROVIDER = "r2"
    process.env.HOSTRIG_R2_ACCOUNT_ID = "abc123account"
    process.env.HOSTRIG_S3_ACCESS_KEY = "r2key"
    process.env.HOSTRIG_S3_SECRET_KEY = "r2secret"
    delete process.env.HOSTRIG_S3_ENDPOINT
    delete process.env.HOSTRIG_MINIO_ENDPOINT
    const cfg = loadPlatformConfig()
    expect(cfg.s3.provider).toBe("r2")
    expect(cfg.s3.endpoint).toBe(
      "https://abc123account.r2.cloudflarestorage.com",
    )
    expect(cfg.s3.region).toBe("auto")
  })

  it("forces gVisor even if runc is set; still reads limits and domain", () => {
    process.env.HOSTRIG_APP_RUNTIME = "runc"
    process.env.HOSTRIG_APP_RUNTIME_REQUIRED = "false"
    process.env.HOSTRIG_BASE_DOMAIN = "apps.example.com"
    process.env.HOSTRIG_PUBLIC_URL_PROTOCOL = "https"
    process.env.HOSTRIG_APP_MEMORY_MB = "256"
    process.env.HOSTRIG_APP_CPUS = "0.5"
    delete process.env.NODE_ENV
    const cfg = loadPlatformConfig()
    expect(cfg.appRuntime).toBe("runsc")
    expect(cfg.appRuntimeRequired).toBe(true)
    expect(cfg.baseDomain).toBe("apps.example.com")
    expect(cfg.publicUrlProtocol).toBe("https")
    expect(cfg.appMemoryBytes).toBe(256 * 1024 * 1024)
    expect(cfg.appNanoCpus).toBe(500_000_000)
  })
})

describe("assertProductionSecrets", () => {
  it("allows missing secrets outside production", () => {
    expect(() =>
      assertProductionSecrets({ NODE_ENV: "development" }),
    ).not.toThrow()
  })

  it("refuses production without secrets", () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "",
        HOSTRIG_SECRETS_KEY: "",
      }),
    ).toThrow(/Missing required secrets/)
  })

  it("refuses the dev-only fallback in production", () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: "production",
        HOSTRIG_SECRETS_KEY: "dev-only-change-me-hostrig-secrets",
      }),
    ).toThrow(/dev-only/)
  })

  it("accepts a strong production secret with S3 configured", () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "super-secret-key-with-enough-length",
        HOSTRIG_S3_PROVIDER: "minio",
        HOSTRIG_S3_ENDPOINT: "https://minio.example.com",
        HOSTRIG_S3_ACCESS_KEY: "AKIA_STRONG_KEY_NOT_DEFAULT",
        HOSTRIG_S3_SECRET_KEY: "super-secret-s3-key-not-default",
      }),
    ).not.toThrow()
  })
})
