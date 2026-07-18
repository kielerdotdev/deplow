import { describe, expect, it, vi } from "vitest"

import type { HetznerCloudClient } from "./hetzner-client"
import { HetznerSpawner } from "./hetzner"

describe("HetznerSpawner", () => {
  it("requires userData", async () => {
    const client: HetznerCloudClient = {
      createServer: vi.fn(),
      getServer: vi.fn(),
      deleteServer: vi.fn(),
    }
    const spawner = new HetznerSpawner(client, {
      location: "fsn1",
      serverType: "cpx22",
      image: "ubuntu-24.04",
    })
    await expect(
      spawner.spawn({ name: "n", serverType: "cpx22" }),
    ).rejects.toThrow(/userData/)
  })

  it("creates a server with userData and returns SpawnedServer", async () => {
    const createServer = vi.fn(async () => ({
      id: 42,
      name: "k3s-n",
      ipv4: "203.0.113.5",
      status: "running",
    }))
    const deleteServer = vi.fn(async () => {})
    const client: HetznerCloudClient = {
      createServer,
      getServer: vi.fn(),
      deleteServer,
    }
    const spawner = new HetznerSpawner(client, {
      location: "fsn1",
      serverType: "cpx22",
      image: "ubuntu-24.04",
      sshKeys: ["my-key"],
    })

    const spawned = await spawner.spawn({
      name: "k3s-n",
      serverType: "cpx22",
      userData: "#!/bin/bash\necho k3s\n",
      labels: { env: "dogfood" },
    })

    expect(spawned).toMatchObject({
      id: "42",
      name: "k3s-n",
      ip: "203.0.113.5",
      status: "running",
      provider: "hetzner",
    })
    expect(createServer).toHaveBeenCalledOnce()
    const arg = createServer.mock.calls[0]![0]
    expect(arg.userData).toContain("k3s")
    expect(arg.labels).toMatchObject({
      "deplow.spawned": "true",
      env: "dogfood",
    })
    expect(arg.sshKeys).toEqual(["my-key"])

    await spawner.destroy("42")
    expect(deleteServer).toHaveBeenCalledWith(42)
  })

  it("polls until ipv4 is assigned", async () => {
    const getServer = vi
      .fn()
      .mockResolvedValueOnce({
        id: 1,
        name: "n",
        ipv4: null,
        status: "initializing",
      })
      .mockResolvedValueOnce({
        id: 1,
        name: "n",
        ipv4: "198.51.100.9",
        status: "running",
      })
    const client: HetznerCloudClient = {
      createServer: vi.fn(async () => ({
        id: 1,
        name: "n",
        ipv4: null,
        status: "initializing",
      })),
      getServer,
      deleteServer: vi.fn(),
    }
    const sleep = vi.fn(async () => {})
    const spawner = new HetznerSpawner(client, {
      location: "fsn1",
      serverType: "cpx22",
      image: "ubuntu-24.04",
      ipWaitMs: 10_000,
      ipPollIntervalMs: 1,
      sleep,
    })
    const spawned = await spawner.spawn({
      name: "n",
      serverType: "cpx22",
      userData: "#!/bin/bash\ntrue\n",
    })
    expect(spawned.ip).toBe("198.51.100.9")
    expect(getServer).toHaveBeenCalled()
    expect(sleep).toHaveBeenCalled()
  })
})
