import { describe, expect, it } from "vitest"

import { SecretsService } from "./secrets.service"

describe("SecretsService", () => {
  it("generates a secrets.yaml document with database, redis, and storage", () => {
    const service = new SecretsService()
    const yaml = service.generateSecretsYaml({
      database: {
        host: "db.internal",
        port: 5432,
        database: "demo",
        user: "demo",
        password: "secret",
        url: "postgres://demo:secret@db.internal:5432/demo",
      },
      redis: {
        host: "redis.internal",
        port: 6379,
        namespace: "demo",
      },
      storage: {
        endpoint: "http://minio.internal:9000",
        bucket: "demo",
        accessKeyId: "ak",
        secretAccessKey: "sk",
        region: "us-east-1",
      },
    })

    expect(yaml).toContain("database:")
    expect(yaml).toContain("name: demo")
    expect(yaml).toContain("redis:")
    expect(yaml).toContain("namespace: demo")
    expect(yaml).toContain("storage:")
    expect(yaml).toContain("bucket: demo")
  })
})
