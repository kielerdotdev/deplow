import { describe, expect, it } from "vitest"

import { injectDeployEnv } from "./inject-env"
import { loadPlatformConfig } from "./platform-config"

describe("injectDeployEnv", () => {
  it("rewrites hosts to docker DNS names, not 127.0.0.1 host ports", () => {
    const config = loadPlatformConfig()
    const env = injectDeployEnv(
      {
        database: {
          host: "127.0.0.1",
          port: 55432,
          database: "d_demo",
          user: "p_demo",
          password: "secret",
          url: "postgres://p_demo:secret@127.0.0.1:55432/d_demo",
        },
        redis: {
          host: "127.0.0.1",
          port: 56379,
          password: "rpass",
          namespace: "demo",
          url: "redis://u_demo:rpass@127.0.0.1:56379",
        },
        storage: {
          endpoint: "http://127.0.0.1:59000",
          bucket: "prj-demo",
          accessKeyId: "prjdemoabc",
          secretAccessKey: "supersecretkey",
          region: "us-east-1",
        },
      },
      config,
    )

    expect(env.DATABASE_URL).toContain("@postgres:5432/")
    expect(env.DATABASE_URL).not.toContain("127.0.0.1")
    expect(env.DATABASE_URL).not.toContain("55432")
    expect(env.REDIS_URL).toContain("@redis:6379")
    expect(env.REDIS_URL).not.toContain("127.0.0.1")
    expect(env.S3_ENDPOINT).toBe("http://minio:9000")
    expect(env.S3_BUCKET).toBe("prj-demo")
    expect(env.S3_ACCESS_KEY).toBe("prjdemoabc")
    expect(env.S3_SECRET_KEY).toBe("supersecretkey")
    // Must not reuse platform root keys in this fixture
    expect(env.S3_ACCESS_KEY).not.toBe(config.minioAccessKey)
  })
})
