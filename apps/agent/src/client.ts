import type {
  AgentClaimResponse,
  AgentHeartbeatRequest,
  AgentJoinRequest,
  AgentJoinResponse,
  AgentJobComplete,
  AgentJobProgress,
} from "@deplow/shared"

export class AgentClient {
  constructor(
    private readonly baseUrl: string,
    private nodeToken: string | null,
  ) {}

  setNodeToken(token: string) {
    this.nodeToken = token
  }

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, "")}/api/agent${path}`
  }

  private headers(auth = true): Record<string, string> {
    const h: Record<string, string> = {
      "content-type": "application/json",
    }
    if (auth && this.nodeToken) {
      h.authorization = `Bearer ${this.nodeToken}`
    }
    return h
  }

  async join(body: AgentJoinRequest): Promise<AgentJoinResponse> {
    const res = await fetch(this.url("/join"), {
      method: "POST",
      headers: this.headers(false),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`join failed (${res.status}): ${text}`)
    }
    return (await res.json()) as AgentJoinResponse
  }

  async heartbeat(body: AgentHeartbeatRequest = {}): Promise<void> {
    const res = await fetch(this.url("/heartbeat"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`heartbeat failed (${res.status}): ${text}`)
    }
  }

  async claim(waitMs = 25_000): Promise<AgentClaimResponse> {
    const res = await fetch(this.url("/jobs/claim"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ waitMs }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`claim failed (${res.status}): ${text}`)
    }
    return (await res.json()) as AgentClaimResponse
  }

  async progress(jobId: string, body: AgentJobProgress): Promise<void> {
    const res = await fetch(this.url(`/jobs/${jobId}/progress`), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`progress failed (${res.status}): ${text}`)
    }
  }

  async complete(jobId: string, body: AgentJobComplete): Promise<void> {
    const res = await fetch(this.url(`/jobs/${jobId}/complete`), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`complete failed (${res.status}): ${text}`)
    }
  }
}
