import { describe, expect, it } from "vitest"

import { loadPlatformConfig } from "../platform-config"
import {
  createServerSpawners,
  getServerSpawner,
  listServerSpawnerProviders,
} from "./factory"

describe("getServerSpawner", () => {
  const spawners = createServerSpawners(loadPlatformConfig())

  it("returns the docker spawner by default", () => {
    const spawner = getServerSpawner(spawners)
    expect(spawner.provider).toBe("docker")
  })

  it("lists registered providers", () => {
    expect(listServerSpawnerProviders(spawners)).toEqual(
      expect.arrayContaining(["docker", "hetzner"]),
    )
  })

  it("throws for unknown providers", () => {
    expect(() => getServerSpawner(spawners, "aws")).toThrow(
      /Unknown server spawner/,
    )
  })
})
