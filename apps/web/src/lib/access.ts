import { createHash, randomBytes } from "node:crypto"

import { ORPCError } from "@orpc/server"
import {
  and,
  db,
  eq,
  organizationMembers,
  organizations,
  projects,
  user,
} from "@hostrig/db"
import type { OrganizationRole } from "@hostrig/shared"

type ActorSession = {
  user: {
    id: string
    email: string
    name: string
  }
}

export const ACTIVE_ORG_COOKIE = "hostrig_org"

const roleRank: Record<OrganizationRole, number> = {
  member: 1,
  owner: 2,
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url")
}

export function slugifyOrgName(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return base || "org"
}

export async function isInstanceAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ instanceAdmin: user.instanceAdmin })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return Boolean(row?.instanceAdmin)
}

export async function assertInstanceAdmin(session: ActorSession): Promise<void> {
  const ok = await isInstanceAdmin(session.user.id)
  if (!ok) {
    throw new ORPCError("FORBIDDEN", {
      message: "Instance admin required",
    })
  }
}

export async function getMembership(
  organizationId: string,
  userId: string,
): Promise<{ role: OrganizationRole } | null> {
  const [row] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
      ),
    )
    .limit(1)
  if (!row) return null
  return { role: row.role as OrganizationRole }
}

export async function requireOrgRole(
  organizationId: string,
  session: ActorSession,
  minRole: OrganizationRole = "member",
): Promise<{ role: OrganizationRole }> {
  const membership = await getMembership(organizationId, session.user.id)
  if (!membership || roleRank[membership.role] < roleRank[minRole]) {
    throw new ORPCError("NOT_FOUND", { message: "Organization not found" })
  }
  return membership
}

export async function assertProjectAccess(
  projectId: string,
  session: ActorSession,
  minRole: OrganizationRole = "member",
): Promise<typeof projects.$inferSelect> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!project) {
    throw new ORPCError("NOT_FOUND", { message: "Project not found" })
  }
  await requireOrgRole(project.organizationId, session, minRole)
  return project
}

export function parseActiveOrgCookie(headers: Headers): string | null {
  const cookie = headers.get("cookie")
  if (!cookie) return null
  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACTIVE_ORG_COOKIE}=`))
  if (!match) return null
  const value = decodeURIComponent(match.slice(ACTIVE_ORG_COOKIE.length + 1))
  return value || null
}

/**
 * Cookie attributes for the active org. Applied via document.cookie on the client
 * (see org-switcher) so HttpOnly cannot be set from JS — membership is always
 * re-validated server-side. Secure is recommended when the public URL is HTTPS.
 */
export function activeOrgSetCookie(organizationId: string): string {
  const secure =
    process.env.NODE_ENV === "production" &&
    (process.env.BETTER_AUTH_URL ?? process.env.HOSTRIG_PUBLIC_URL ?? "").startsWith(
      "https:",
    )
  const parts = [
    `${ACTIVE_ORG_COOKIE}=${encodeURIComponent(organizationId)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 365}`,
  ]
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

/**
 * Whether public email/password sign-up is allowed.
 * - HOSTRIG_ALLOW_SIGNUP=0|false → never
 * - HOSTRIG_ALLOW_SIGNUP=1|true → always
 * - default: only until the first instance admin exists (bootstrap)
 */
export async function isSignupAllowed(): Promise<boolean> {
  const raw = (process.env.HOSTRIG_ALLOW_SIGNUP ?? "").trim().toLowerCase()
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false
  }
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true
  }
  const [admins] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.instanceAdmin, true))
    .limit(1)
  return !admins
}

export async function resolveActiveOrganizationId(
  session: ActorSession,
  headers: Headers,
  explicitId?: string | null,
): Promise<string> {
  const candidate =
    explicitId || parseActiveOrgCookie(headers) || null

  if (candidate) {
    await requireOrgRole(candidate, session, "member")
    return candidate
  }

  const [first] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, session.user.id))
    .limit(1)

  if (!first) {
    throw new ORPCError("BAD_REQUEST", {
      message: "No organization membership found",
    })
  }
  return first.organizationId
}

export async function createPersonalOrganization(params: {
  userId: string
  name: string
  email: string
}): Promise<string> {
  const baseName = params.name.trim() || params.email.split("@")[0] || "Personal"
  let slug = slugifyOrgName(baseName)
  const [taken] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1)
  if (taken) {
    slug = `${slug}-${params.userId.slice(0, 8)}`
  }

  const orgId = crypto.randomUUID()
  const now = new Date()
  await db.insert(organizations).values({
    id: orgId,
    name: baseName,
    slug,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(organizationMembers).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId: params.userId,
    role: "owner",
    createdAt: now,
  })

  // First user on the instance becomes instance admin (atomic claim).
  await claimInstanceAdminIfNone(params.userId)

  return orgId
}

/** Promote user to instance admin only if no admin exists (SQLite-serialized). */
export async function claimInstanceAdminIfNone(userId: string): Promise<boolean> {
  const { getSqlite } = await import("@hostrig/db")
  const sqlite = getSqlite()
  const info = sqlite
    .prepare(
      `UPDATE user SET instance_admin = 1
       WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM user WHERE instance_admin = 1)`,
    )
    .run(userId) as { changes: number }
  return info.changes > 0
}
