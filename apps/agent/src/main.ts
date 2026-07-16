import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"

import {
  loadRuntimeConfigFromEnv,
  runDeployJob,
  runDestroyJob,
  runLogsJob,
  runStopJob,
  type DeployJobFailure,
} from "@deplow/runtime"
import {
  agentDeployJobPayloadSchema,
  agentDestroyJobPayloadSchema,
  agentStopJobPayloadSchema,
} from "@deplow/shared"

import { AgentClient } from "./client.js"

const AGENT_VERSION = "0.1.0"
const STATE_DIR =
  process.env.DEPLOW_AGENT_STATE_DIR ?? "/var/lib/deplow-agent"
const TOKEN_PATH = path.join(STATE_DIR, "node-token")

function requireEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is required`)
  return v
}

function detectAdvertiseHost(): string | undefined {
  if (process.env.DEPLOW_ADVERTISE_HOST?.trim()) {
    return process.env.DEPLOW_ADVERTISE_HOST.trim()
  }
  return undefined
}

async function ensureJoined(client: AgentClient): Promise<void> {
  mkdirSync(STATE_DIR, { recursive: true })
  if (existsSync(TOKEN_PATH)) {
    const token = readFileSync(TOKEN_PATH, "utf8").trim()
    if (token) {
      client.setNodeToken(token)
      return
    }
  }

  const envToken = process.env.DEPLOW_NODE_TOKEN?.trim()
  if (envToken) {
    writeFileSync(TOKEN_PATH, envToken, { mode: 0o600 })
    client.setNodeToken(envToken)
    return
  }

  const joinToken = requireEnv("DEPLOW_JOIN_TOKEN")
  const joined = await client.join({
    joinToken,
    name: process.env.DEPLOW_NODE_NAME?.trim() || undefined,
    advertiseHost: detectAdvertiseHost(),
    agentVersion: AGENT_VERSION,
    capabilities: { deploy: true, docker: true },
  })
  writeFileSync(TOKEN_PATH, joined.nodeToken, { mode: 0o600 })
  client.setNodeToken(joined.nodeToken)
  console.log(`[deplow-agent] joined as node ${joined.name} (${joined.nodeId})`)
}

async function runJob(
  client: AgentClient,
  job: {
    id: string
    type: string
    payload: unknown
  },
): Promise<void> {
  const config = loadRuntimeConfigFromEnv()
  const advertiseHost = detectAdvertiseHost()

  try {
    if (job.type === "deploy") {
      const payload = agentDeployJobPayloadSchema.parse(job.payload)
      const result = await runDeployJob(config, payload, {
        onProgress: async (p) => {
          await client.progress(job.id, p)
        },
      })
      await client.complete(job.id, {
        ok: true,
        result: {
          containerId: result.containerId,
          image: result.image,
          publishedPort: result.publishedPort,
          advertiseHost,
          upstream:
            advertiseHost && result.publishedPort
              ? `${advertiseHost}:${result.publishedPort}`
              : undefined,
          buildLogs: result.buildLogs,
          gitSha: result.gitSha,
          buildStrategy: result.buildStrategy,
        },
      })
      return
    }

    if (job.type === "stop") {
      const payload = agentStopJobPayloadSchema.parse(job.payload)
      await runStopJob(config, payload)
      await client.complete(job.id, { ok: true, result: {} })
      return
    }

    if (job.type === "destroy") {
      const payload = agentDestroyJobPayloadSchema.parse(job.payload)
      await runDestroyJob(config, payload)
      await client.complete(job.id, { ok: true, result: {} })
      return
    }

    if (job.type === "logs") {
      const payload = agentStopJobPayloadSchema.parse(job.payload)
      const logs = await runLogsJob(config, payload)
      await client.complete(job.id, { ok: true, result: { logs } })
      return
    }

    await client.complete(job.id, {
      ok: false,
      error: { message: `Unsupported job type: ${job.type}`, code: "unsupported" },
    })
  } catch (error) {
    const failure = error as DeployJobFailure
    const message =
      failure && typeof failure === "object" && "message" in failure
        ? String(failure.message)
        : error instanceof Error
          ? error.message
          : String(error)
    await client.complete(job.id, {
      ok: false,
      error: {
        message,
        code: failure?.code,
        stage: failure?.stage,
      },
      result: failure?.buildLogs
        ? { buildLogs: failure.buildLogs }
        : undefined,
    })
  }
}

async function main() {
  const baseUrl = requireEnv("DEPLOW_URL")
  const client = new AgentClient(baseUrl, null)
  await ensureJoined(client)

  console.log(`[deplow-agent] v${AGENT_VERSION} connected to ${baseUrl}`)

  // Heartbeat loop
  void (async () => {
    for (;;) {
      try {
        await client.heartbeat({
          advertiseHost: detectAdvertiseHost(),
          agentVersion: AGENT_VERSION,
          capabilities: { deploy: true, docker: true },
        })
      } catch (err) {
        console.error("[deplow-agent] heartbeat error", err)
      }
      await new Promise((r) => setTimeout(r, 20_000))
    }
  })()

  // Job loop
  for (;;) {
    try {
      const { job } = await client.claim(25_000)
      if (!job) continue
      console.log(`[deplow-agent] claimed ${job.type} job ${job.id}`)
      await runJob(client, job)
      console.log(`[deplow-agent] finished job ${job.id}`)
    } catch (err) {
      console.error("[deplow-agent] claim/run error", err)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

main().catch((err) => {
  console.error("[deplow-agent] fatal", err)
  process.exit(1)
})
