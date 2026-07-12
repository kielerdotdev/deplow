import { describe, expect, it } from "vitest"

import type { ProjectCredentials } from "@deplow/shared"

import { injectDeployEnv, injectDeployEnvFromBindings } from "./inject-env"
import { loadPlatformConfig } from "./platform-config"

describe("injectDeployEnv", () => {
  it("uses dedicated container hosts from credentials", () => {
    const config = loadPlatformConfig()
    const env = injectDeployEnv(
      {
        database: {
          host: "deplow-pg-demo",
          port: 5432,
          database: "d_demo",
          user: "p_demo",
          password: "secret",
          url: "postgres://p_demo:secret@127.0.0.1:40123/d_demo",
        },
        redis: {
          host: "deplow-redis-demo",
          port: 6379,
          password: "rpass",
          namespace: "u_demo",
          url: "redis://:rpass@127.0.0.1:40124",
        },
        storage: {
          endpoint: "http://127.0.0.1:59000",
          bucket: "prj-demo",
          accessKeyId: "prjdemoabc",
          secretAccessKey: "supersecretkey",
          region: "us-east-1",
        },
      } satisfies ProjectCredentials,
      config,
    )

    expect(env.DATABASE_URL).toContain("@deplow-pg-demo:5432/")
    expect(env.DATABASE_URL).not.toContain("127.0.0.1")
    expect(env.REDIS_URL).toContain("@deplow-redis-demo:6379")
    expect(env.REDIS_URL).not.toContain("127.0.0.1")
    expect(env.S3_ENDPOINT).toBe("http://minio:9000")
    expect(env.S3_BUCKET).toBe("prj-demo")
    expect(env.S3_ACCESS_KEY).toBe("prjdemoabc")
    expect(env.S3_SECRET_KEY).toBe("supersecretkey")
    expect(env.S3_ACCESS_KEY).not.toBe(config.minioAccessKey)
    expect(env.HOME).toBe("/tmp")
    expect(env.ASTRO_TELEMETRY_DISABLED).toBe("1")
  })
})

describe("injectDeployEnvFromBindings", () => {
  it("only injects bound env keys", () => {
    const config = loadPlatformConfig()
    const env = injectDeployEnvFromBindings(
      {
        bindings: [
          {
            envKey: "REDIS_URL",
            url: "redis://:x@deplow-redis-demo:6379",
          },
        ],
        storage: null,
      },
      config,
      { SERVICE_NAME: "api" },
    )
    expect(env.REDIS_URL).toContain("deplow-redis-demo")
    expect(env.DATABASE_URL).toBeUndefined()
    expect(env.SERVICE_NAME).toBe("api")
  })
})
