import {
  and,
  eq,
  isNull,
  observeKeys,
  organizationMembers,
  projects,
  user,
} from "@deplow/db"

import { env } from "@/lib/env"
import { db } from "@/lib/services"

import { buildDsn } from "@deplow/observe"

import {
  buildProjectDsn,
  enableObserveForProject,
  findObserveProjectBySentryId,
} from "./store"

export const DOGFOOD_PROJECT_SLUG = "deplow-dogfood"

const INGEST_PATH =
  /\/api\/\d+\/(envelope|store|otlp)(?:\/|$)/i

export function isObserveIngestUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    return INGEST_PATH.test(new URL(url, "http://local").pathname)
  } catch {
    return INGEST_PATH.test(url)
  }
}

export function isDogfoodMetaPath(pathname: string): boolean {
  return (
    pathname === "/api/internal/dogfood" ||
    pathname.startsWith("/api/internal/dogfood?")
  )
}

/**
 * Base URL for in-process dogfood exporters (Node Sentry + OTEL).
 * Always loopback — never hairpin through DEPLOW_OBSERVE_INGEST_URL (LAN/public),
 * which often points at a stale port (e.g. :3010 while vite listens on :9565).
 */
export function dogfoodSelfBaseUrl(): string {
  const port = (
    process.env.PORT ||
    process.env.DEPLOW_DEV_PORT ||
    "9565"
  ).trim()
  return `http://127.0.0.1:${port}`
}

export function buildDogfoodOtelEndpoint(sentryId: number): string {
  return `${dogfoodSelfBaseUrl()}/api/${sentryId}/otlp`
}

export function buildDogfoodServerDsn(
  sentryId: number,
  publicKey: string,
): string {
  const u = new URL(dogfoodSelfBaseUrl())
  return buildDsn({
    publicKey,
    host: u.host,
    sentryId,
    protocol: "http",
  })
}

/** Shared Sentry.init options for dogfood → self-hosted Observe ingest. */
export function dogfoodSentryOptions(dsn: string) {
  return {
    dsn,
    environment: env.isDev ? "development" : "dogfood",
    release: process.env.npm_package_version
      ? `deplow@${process.env.npm_package_version}`
      : undefined,
    // OTEL owns traces; Sentry is errors-only for dogfood.
    tracesSampleRate: 0,
    tracePropagationTargets: [] as (string | RegExp)[],
    beforeSend(event: { request?: { url?: string } }) {
      if (isObserveIngestUrl(event.request?.url)) return null
      return event
    },
  }
}

export type DogfoodBootstrap = {
  /** Browser-facing DSN (public / ingest URL). */
  dsn: string
  /** Node Sentry DSN (loopback — same process). */
  serverDsn: string
  otelEndpoint: string
  otelHeaders: string
  projectId: string
  sentryId: number
}

let cached: DogfoodBootstrap | undefined
let bootstrapPromise: Promise<DogfoodBootstrap | null> | null = null

/**
 * Ensure a `deplow-dogfood` Deploy project exists, Observe is enabled on it,
 * the project owner is an Observe member, and return project-scoped DSN + OTEL.
 */
export async function ensureDogfoodBootstrap(): Promise<DogfoodBootstrap | null> {
  if (!env.observeDogfood) return null
  if (cached) return cached
  if (bootstrapPromise) return bootstrapPromise

  bootstrapPromise = (async () => {
    if (env.observeDogfoodDsn) {
      const dsn = env.observeDogfoodDsn
      const parsed = new URL(dsn)
      const sentryId = Number(parsed.pathname.replace(/^\/+|\/+$/g, ""))
      const publicKey = parsed.username
      let projectId = env.observeDogfoodProjectId || ""
      if (!projectId && Number.isFinite(sentryId)) {
        const op = await findObserveProjectBySentryId(sentryId)
        projectId = op?.projectId ?? ""
      }
      cached = {
        dsn,
        serverDsn:
          Number.isFinite(sentryId) && publicKey
            ? buildDogfoodServerDsn(sentryId, publicKey)
            : dsn,
        otelEndpoint: Number.isFinite(sentryId)
          ? buildDogfoodOtelEndpoint(sentryId)
          : "",
        otelHeaders: publicKey
          ? `x-sentry-auth=sentry sentry_key=${publicKey}`
          : "",
        projectId,
        sentryId: Number.isFinite(sentryId) ? sentryId : 0,
      }
      console.info(
        `[observe-dogfood] env DSN sentryId=${cached.sentryId} otel=${cached.otelEndpoint} project=${projectId || "(missing)"}`,
      )
      return cached
    }

    try {
      const projectId = await ensureDogfoodProjectId()
      if (!projectId) {
        // Org may not exist yet — retry on the next request after signup.
        bootstrapPromise = null
        return null
      }

      const { observeProject, key } = await enableObserveForProject(projectId)
      let publicKey = key?.publicKey
      if (!publicKey) {
        const [fallback] = await db
          .select()
          .from(observeKeys)
          .where(
            and(
              eq(observeKeys.observeProjectId, observeProject.id),
              isNull(observeKeys.revokedAt),
            ),
          )
          .limit(1)
        publicKey = fallback?.publicKey
      }
      if (!publicKey) {
        bootstrapPromise = null
        return null
      }

      cached = {
        // Browser / external SDKs use the configured ingest URL.
        dsn: buildProjectDsn(observeProject.sentryId, publicKey),
        // In-process exporters always hit loopback on this server's listen port.
        serverDsn: buildDogfoodServerDsn(observeProject.sentryId, publicKey),
        otelEndpoint: buildDogfoodOtelEndpoint(observeProject.sentryId),
        otelHeaders: `x-sentry-auth=sentry sentry_key=${publicKey}`,
        projectId,
        sentryId: observeProject.sentryId,
      }
      console.info(
        `[observe-dogfood] project=${projectId} sentryId=${observeProject.sentryId} otel=${cached.otelEndpoint} dsnHost=${new URL(cached.dsn).host}`,
      )
      return cached
    } catch (err) {
      console.warn("[observe-dogfood] bootstrap failed", err)
      bootstrapPromise = null
      return null
    }
  })()

  return bootstrapPromise
}

/** @deprecated use ensureDogfoodBootstrap */
export async function resolveDogfoodDsn(): Promise<string | null> {
  const boot = await ensureDogfoodBootstrap()
  return boot?.dsn ?? null
}

async function ensureDogfoodProjectId(): Promise<string | null> {
  if (env.observeDogfoodProjectId) return env.observeDogfoodProjectId

  const preferred = await pickPreferredOrgOwner()
  if (!preferred) {
    console.info(
      "[observe-dogfood] waiting for an organization (sign up once)",
    )
    return null
  }

  const [existing] = await db
    .select({
      id: projects.id,
      ownerId: projects.ownerId,
      organizationId: projects.organizationId,
    })
    .from(projects)
    .where(eq(projects.slug, DOGFOOD_PROJECT_SLUG))
    .limit(1)

  if (existing) {
    // Reclaim from e2e/test owners so the real user can open it in Observe.
    if (
      existing.ownerId !== preferred.userId ||
      existing.organizationId !== preferred.orgId
    ) {
      const [owner] = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, existing.ownerId))
        .limit(1)
      if (!owner || isTestEmail(owner.email)) {
        await db
          .update(projects)
          .set({
            ownerId: preferred.userId,
            organizationId: preferred.orgId,
          })
          .where(eq(projects.id, existing.id))
        console.info(
          `[observe-dogfood] reassigned ${DOGFOOD_PROJECT_SLUG} → ${preferred.email}`,
        )
      }
    }
    return existing.id
  }

  const { ensureClusterPlacementNode } = await import("@/lib/k8s/cluster-store")
  const nodeId = await ensureClusterPlacementNode().catch(() => null)
  const id = crypto.randomUUID()
  await db.insert(projects).values({
    id,
    name: DOGFOOD_PROJECT_SLUG,
    slug: DOGFOOD_PROJECT_SLUG,
    organizationId: preferred.orgId,
    ownerId: preferred.userId,
    nodeId,
    status: "ready",
    backupIntervalMs: 86_400_000,
  })
  console.info(
    `[observe-dogfood] created project ${DOGFOOD_PROJECT_SLUG} for ${preferred.email}`,
  )
  return id
}

function isTestEmail(email: string): boolean {
  const e = email.toLowerCase()
  return (
    e.endsWith("@example.com") ||
    e.endsWith("@ex.com") ||
    e.includes("+e2e") ||
    e.startsWith("e2e-") ||
    e.startsWith("e2e2-") ||
    e.startsWith("observe-e2e") ||
    e.startsWith("git-e2e") ||
    e.startsWith("yoyo-e2e") ||
    e.startsWith("yoyo-ui-") ||
    e.startsWith("clone-e2e") ||
    e.startsWith("probe") ||
    e.startsWith("sched-") ||
    e.startsWith("netfix-") ||
    e.startsWith("ui-") ||
    e.startsWith("fix-menu-") ||
    e.startsWith("skeptic-") ||
    e === "marketing@deplow.local"
  )
}

async function pickPreferredOrgOwner(): Promise<{
  orgId: string
  userId: string
  email: string
} | null> {
  const rows = await db
    .select({
      orgId: organizationMembers.organizationId,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      email: user.email,
      instanceAdmin: user.instanceAdmin,
    })
    .from(organizationMembers)
    .innerJoin(user, eq(user.id, organizationMembers.userId))

  if (rows.length === 0) return null

  const ranked = [...rows].sort((a, b) => {
    const score = (r: (typeof rows)[number]) =>
      (r.instanceAdmin ? 8 : 0) +
      (r.role === "owner" ? 4 : 0) +
      (isTestEmail(r.email) ? 0 : 2)
    return score(b) - score(a)
  })

  const best = ranked[0]!
  return { orgId: best.orgId, userId: best.userId, email: best.email }
}
