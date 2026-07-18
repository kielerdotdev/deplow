/**
 * Thin Hetzner Cloud API client (official REST). Injectable for tests.
 */

export type HetznerCreateServerInput = {
  name: string
  serverType: string
  image: string
  location: string
  userData: string
  labels?: Record<string, string>
  sshKeys?: string[]
}

export type HetznerServer = {
  id: number
  name: string
  ipv4: string | null
  status: string
}

export interface HetznerCloudClient {
  createServer(input: HetznerCreateServerInput): Promise<HetznerServer>
  getServer(id: number): Promise<HetznerServer>
  deleteServer(id: number): Promise<void>
}

type FetchLike = typeof fetch

const HETZNER_API = "https://api.hetzner.cloud/v1"

function ipv4FromServer(server: {
  public_net?: { ipv4?: { ip?: string | null } | null }
}): string | null {
  const ip = server.public_net?.ipv4?.ip
  return typeof ip === "string" && ip.length > 0 ? ip : null
}

async function assertOk(
  res: Response,
  label: string,
  bodySlice = 300,
): Promise<void> {
  if (res.ok) return
  const body = await res.text()
  throw new Error(`${label} (${res.status}): ${body.slice(0, bodySlice)}`)
}

export function createHetznerCloudClient(
  token: string,
  fetchImpl: FetchLike = fetch,
): HetznerCloudClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "deplow",
  }

  return {
    async createServer(input) {
      const res = await fetchImpl(`${HETZNER_API}/servers`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: input.name,
          server_type: input.serverType,
          image: input.image,
          location: input.location,
          user_data: input.userData,
          labels: input.labels,
          ssh_keys: input.sshKeys,
          start_after_create: true,
        }),
      })
      await assertOk(res, "hetzner createServer")
      const data = (await res.json()) as {
        server: {
          id: number
          name: string
          status: string
          public_net?: { ipv4?: { ip?: string | null } | null }
        }
      }
      return {
        id: data.server.id,
        name: data.server.name,
        ipv4: ipv4FromServer(data.server),
        status: data.server.status,
      }
    },

    async getServer(id) {
      const res = await fetchImpl(`${HETZNER_API}/servers/${id}`, {
        method: "GET",
        headers,
      })
      await assertOk(res, "hetzner getServer")
      const data = (await res.json()) as {
        server: {
          id: number
          name: string
          status: string
          public_net?: { ipv4?: { ip?: string | null } | null }
        }
      }
      return {
        id: data.server.id,
        name: data.server.name,
        ipv4: ipv4FromServer(data.server),
        status: data.server.status,
      }
    },

    async deleteServer(id) {
      const res = await fetchImpl(`${HETZNER_API}/servers/${id}`, {
        method: "DELETE",
        headers,
      })
      if (res.status === 404) return
      await assertOk(res, "hetzner deleteServer")
    },
  }
}

/** Client that fails on first use when the API token is missing. */
export function createUnconfiguredHetznerCloudClient(): HetznerCloudClient {
  const fail = async (): Promise<never> => {
    throw new Error(
      "Hetzner is not configured. Set DEPLOW_HETZNER_API_TOKEN to spawn servers.",
    )
  }
  return {
    createServer: fail,
    getServer: fail,
    deleteServer: fail,
  }
}
