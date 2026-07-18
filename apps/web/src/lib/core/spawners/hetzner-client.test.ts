import { describe, expect, it, vi } from "vitest"

import {
  createHetznerCloudClient,
  createUnconfiguredHetznerCloudClient,
} from "./hetzner-client"

describe("createHetznerCloudClient", () => {
  it("POSTs createServer with bearer auth and maps ipv4", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        server: {
          id: 99,
          name: "agent-1",
          status: "initializing",
          public_net: { ipv4: { ip: "203.0.113.10" } },
        },
      }),
    )

    const client = createHetznerCloudClient("test-token", fetchImpl as typeof fetch)
    const server = await client.createServer({
      name: "agent-1",
      serverType: "cpx22",
      image: "ubuntu-24.04",
      location: "fsn1",
      userData: "#!/bin/bash\necho hi",
      labels: { "deplow.spawned": "true" },
      sshKeys: ["laptop"],
    })

    expect(server).toEqual({
      id: 99,
      name: "agent-1",
      ipv4: "203.0.113.10",
      status: "initializing",
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe("https://api.hetzner.cloud/v1/servers")
    expect(init?.method).toBe("POST")
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer test-token")
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body.name).toBe("agent-1")
    expect(body.server_type).toBe("cpx22")
    expect(body.user_data).toContain("echo hi")
    expect(body.ssh_keys).toEqual(["laptop"])
  })

  it("GETs getServer and DELETEs deleteServer", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          server: {
            id: 7,
            name: "n",
            status: "running",
            public_net: { ipv4: { ip: "198.51.100.1" } },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const client = createHetznerCloudClient("t", fetchImpl as typeof fetch)
    await expect(client.getServer(7)).resolves.toMatchObject({
      id: 7,
      ipv4: "198.51.100.1",
      status: "running",
    })
    await client.deleteServer(7)
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://api.hetzner.cloud/v1/servers/7",
    )
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe("DELETE")
  })

  it("treats 404 on delete as success", async () => {
    const fetchImpl = vi.fn(async () => new Response("gone", { status: 404 }))
    const client = createHetznerCloudClient("t", fetchImpl as typeof fetch)
    await expect(client.deleteServer(1)).resolves.toBeUndefined()
  })
})

describe("createUnconfiguredHetznerCloudClient", () => {
  it("throws a clear error on use", async () => {
    const client = createUnconfiguredHetznerCloudClient()
    await expect(
      client.createServer({
        name: "x",
        serverType: "cpx22",
        image: "ubuntu-24.04",
        location: "fsn1",
        userData: "",
      }),
    ).rejects.toThrow(/DEPLOW_HETZNER_API_TOKEN/)
  })
})
