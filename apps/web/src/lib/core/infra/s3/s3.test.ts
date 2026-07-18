import { describe, expect, it } from "vitest"

import { createS3Adapter, r2EndpointForAccount } from "./index"

describe("createS3Adapter", () => {
  it("builds a minio adapter", () => {
    const adapter = createS3Adapter({
      provider: "minio",
      endpoint: "http://127.0.0.1:9000",
      publicEndpoint: "http://127.0.0.1:9000",
      appEndpoint: "http://minio:9000",
      accessKeyId: "key",
      secretAccessKey: "secret",
      region: "us-east-1",
      backupBucket: "hostrig-backups",
    })
    expect(adapter.provider).toBe("minio")
  })

  it("builds an r2 adapter", () => {
    const endpoint = r2EndpointForAccount("acct")
    const adapter = createS3Adapter({
      provider: "r2",
      endpoint,
      publicEndpoint: endpoint,
      appEndpoint: endpoint,
      accessKeyId: "key",
      secretAccessKey: "secret",
      region: "auto",
      backupBucket: "hostrig-backups",
    })
    expect(adapter.provider).toBe("r2")
    expect(endpoint).toBe("https://acct.r2.cloudflarestorage.com")
  })
})
