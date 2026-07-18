/**
 * Thin NetBird Management API client (PAT auth).
 * Docs: https://docs.netbird.io/api
 */

export type NetbirdGroup = {
  id: string
  name: string
}

export type NetbirdPeer = {
  id: string
  name: string
  hostname?: string
  connected: boolean
  ip?: string
}

export type NetbirdSetupKey = {
  id: string | number
  name: string
  key?: string
  valid?: boolean
  revoked?: boolean
}

export type NetbirdDomain = {
  id: string
  domain: string
  validated: boolean
  type: string
  target_cluster?: string
  require_subdomain?: boolean
}

export type NetbirdRpService = {
  id: string
  name: string
  domain: string
  mode: string
  enabled?: boolean
}

export class NetbirdApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message)
    this.name = "NetbirdApiError"
  }
}

export function normalizeManagementUrl(url: string): string {
  return url.trim().replace(/\/+$/, "")
}

export function joinApiUrl(managementUrl: string, path: string): string {
  const base = normalizeManagementUrl(managementUrl)
  const p = path.startsWith("/") ? path : `/${path}`
  // Cloud + self-hosted both expose /api/*
  if (base.endsWith("/api")) return `${base}${p}`
  return `${base}/api${p}`
}

export function createNetbirdClient(managementUrl: string, pat: string) {
  const token = pat.trim()
  const base = normalizeManagementUrl(managementUrl)

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    // Block private/link-local management URLs (admin SSRF hygiene).
    const { assertSafeOutboundUrl } = await import("@/lib/core/safe-url")
    assertSafeOutboundUrl(base, { allowHttp: true, blockPrivate: true })
    const url = joinApiUrl(base, path)
    const res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Token ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
      let msg = `NetBird API ${method} ${path} failed (${res.status})`
      try {
        const j = JSON.parse(text) as { message?: string; error?: string }
        if (j.message || j.error) msg = j.message || j.error || msg
      } catch {
        if (text.trim()) msg = `${msg}: ${text.slice(0, 200)}`
      }
      throw new NetbirdApiError(msg, res.status, text)
    }
    if (!text.trim()) return undefined as T
    return JSON.parse(text) as T
  }

  return {
    managementUrl: base,

    async validateToken(): Promise<void> {
      await request<unknown>("GET", "/groups")
    },

    async listGroups(): Promise<NetbirdGroup[]> {
      return request<NetbirdGroup[]>("GET", "/groups")
    },

    async createGroup(name: string): Promise<NetbirdGroup> {
      return request<NetbirdGroup>("POST", "/groups", { name, peers: [] })
    },

    async ensureHostrigGroup(): Promise<NetbirdGroup> {
      const groups = await this.listGroups()
      // Never use the built-in "All" group — NetBird rejects it on setup keys.
      const existing = groups.find(
        (g) => g.name.toLowerCase() === "hostrig",
      )
      if (existing) return existing
      return this.createGroup("hostrig")
    },

    async createSetupKey(input: {
      name: string
      groupIds: string[]
    }): Promise<NetbirdSetupKey> {
      return request<NetbirdSetupKey>("POST", "/setup-keys", {
        name: input.name,
        type: "reusable",
        expires_in: 86_400 * 30,
        auto_groups: input.groupIds,
        usage_limit: 0,
        ephemeral: false,
        allow_extra_dns_labels: true,
      })
    },

    async deleteSetupKey(keyId: string | number): Promise<void> {
      await request<void>("DELETE", `/setup-keys/${keyId}`)
    },

    async listPeers(): Promise<NetbirdPeer[]> {
      return request<NetbirdPeer[]>("GET", "/peers")
    },

    async findPeerByName(name: string): Promise<NetbirdPeer | null> {
      const peers = await this.listPeers()
      const n = name.toLowerCase()
      return (
        peers.find(
          (p) =>
            p.name?.toLowerCase() === n ||
            p.hostname?.toLowerCase() === n,
        ) ?? null
      )
    },

    async listDomains(): Promise<NetbirdDomain[]> {
      return request<NetbirdDomain[]>("GET", "/reverse-proxies/domains")
    },

    async listServices(): Promise<NetbirdRpService[]> {
      return request<NetbirdRpService[]>("GET", "/reverse-proxies/services")
    },

    async createHttpService(input: {
      name: string
      domain: string
      peerId: string
      port?: number
    }): Promise<NetbirdRpService> {
      return request<NetbirdRpService>("POST", "/reverse-proxies/services", {
        name: input.name,
        domain: input.domain,
        mode: "http",
        targets: [
          {
            target_id: input.peerId,
            target_type: "peer",
            path: "/",
            protocol: "http",
            port: input.port ?? 80,
            enabled: true,
          },
        ],
        enabled: true,
        pass_host_header: true,
        rewrite_redirects: false,
      })
    },

    async updateHttpService(
      serviceId: string,
      input: {
        name: string
        domain: string
        peerId: string
        port?: number
      },
    ): Promise<NetbirdRpService> {
      return request<NetbirdRpService>(
        "PUT",
        `/reverse-proxies/services/${serviceId}`,
        {
          name: input.name,
          domain: input.domain,
          mode: "http",
          targets: [
            {
              target_id: input.peerId,
              target_type: "peer",
              path: "/",
              protocol: "http",
              port: input.port ?? 80,
              enabled: true,
            },
          ],
          enabled: true,
          pass_host_header: true,
          rewrite_redirects: false,
        },
      )
    },

    async deleteService(serviceId: string): Promise<void> {
      await request<void>("DELETE", `/reverse-proxies/services/${serviceId}`)
    },

    async listPolicies(): Promise<Array<{ id: string; name: string }>> {
      return request<Array<{ id: string; name: string }>>("GET", "/policies")
    },

    /**
     * Allow the whole mesh (incl. reverse-proxy path) to reach Hostrig Traefik.
     */
    async ensureHostrigEdgePolicy(input: {
      hostrigGroupId: string
      ports: string[]
    }): Promise<void> {
      const groups = await this.listGroups()
      const all = groups.find((g) => g.name.toLowerCase() === "all")
      if (!all) return

      const policies = await this.listPolicies()
      const existing = policies.find((p) => p.name === "Hostrig Traefik edge")
      const body = {
        name: "Hostrig Traefik edge",
        description:
          "Allow NetBird mesh/proxy to reach Hostrig Traefik on the k3s peer",
        enabled: true,
        rules: [
          {
            name: "to-hostrig-traefik",
            description: "TCP to Traefik origin / nodePort",
            enabled: true,
            action: "accept",
            bidirectional: false,
            protocol: "tcp",
            ports: input.ports,
            sources: [all.id],
            destinations: [input.hostrigGroupId],
          },
        ],
      }
      if (existing) {
        await request("PUT", `/policies/${existing.id}`, body)
      } else {
        await request("POST", "/policies", body)
      }
    },
  }
}

export type NetbirdClient = ReturnType<typeof createNetbirdClient>

/** Build create/update payload for unit tests. */
export function buildHttpServicePayload(input: {
  name: string
  domain: string
  peerId: string
  port?: number
}) {
  return {
    name: input.name,
    domain: input.domain,
    mode: "http" as const,
    targets: [
      {
        target_id: input.peerId,
        target_type: "peer" as const,
        path: "/",
        protocol: "http" as const,
        port: input.port ?? 80,
        enabled: true,
      },
    ],
    enabled: true,
    pass_host_header: true,
    rewrite_redirects: false,
  }
}
