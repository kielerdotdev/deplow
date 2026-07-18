import { createHash } from "node:crypto"

import { ORPCError } from "@orpc/server"
import * as z from "zod"

import {
  and,
  db,
  eq,
  isNull,
  organizationInvites,
  organizationMembers,
  organizations,
  user,
} from "@hostrig/db"
import {
  acceptInviteInputSchema,
  inviteOrganizationMemberInputSchema,
  removeMemberInputSchema,
  setActiveOrganizationInputSchema,
  updateMemberRoleInputSchema,
  updateOrganizationInputSchema,
} from "@hostrig/shared"

import {
  ACTIVE_ORG_COOKIE,
  activeOrgSetCookie,
  generateInviteToken,
  hashToken,
  requireOrgRole,
  resolveActiveOrganizationId,
  slugifyOrgName,
} from "@/lib/access"

import { authedProcedure, publicProcedure, writeProcedure } from "./middleware"

function orgSummary(
  org: typeof organizations.$inferSelect,
  role: "owner" | "member",
) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    iconUrl: org.iconUrl ?? null,
    timezone: org.timezone || "UTC",
    role,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  }
}

export const list = authedProcedure.handler(async ({ context }) => {
  const memberships = await db
    .select({
      role: organizationMembers.role,
      org: organizations,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizationMembers.organizationId, organizations.id),
    )
    .where(eq(organizationMembers.userId, context.session!.user.id))

  return memberships.map((row) =>
    orgSummary(row.org, row.role as "owner" | "member"),
  )
})

export const get = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const membership = await requireOrgRole(input.id, context.session!, "member")
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, input.id))
      .limit(1)
    if (!org) {
      throw new ORPCError("NOT_FOUND", { message: "Organization not found" })
    }
    return orgSummary(org, membership.role)
  })

export const getActive = authedProcedure.handler(async ({ context }) => {
  const organizationId = await resolveActiveOrganizationId(
    context.session!,
    context.headers,
  )
  const membership = await requireOrgRole(
    organizationId,
    context.session!,
    "member",
  )
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1)
  if (!org) {
    throw new ORPCError("NOT_FOUND", { message: "Organization not found" })
  }
  return orgSummary(org, membership.role)
})

export const setActive = writeProcedure
  .input(setActiveOrganizationInputSchema)
  .handler(async ({ context, input }) => {
    await requireOrgRole(input.organizationId, context.session!, "member")
    return {
      organizationId: input.organizationId,
      setCookie: activeOrgSetCookie(input.organizationId),
    }
  })

export const update = writeProcedure
  .input(updateOrganizationInputSchema)
  .handler(async ({ context, input }) => {
    await requireOrgRole(input.id, context.session!, "owner")
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, input.id))
      .limit(1)
    if (!org) {
      throw new ORPCError("NOT_FOUND", { message: "Organization not found" })
    }

    const nextName = input.name?.trim() || org.name
    let nextSlug = input.slug?.trim() || org.slug
    if (input.slug) {
      nextSlug = slugifyOrgName(input.slug)
      const [taken] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, nextSlug))
        .limit(1)
      if (taken && taken.id !== org.id) {
        throw new ORPCError("CONFLICT", { message: "Slug is already taken" })
      }
    }

    const nextIconUrl =
      input.iconUrl === undefined
        ? org.iconUrl
        : input.iconUrl === "" || input.iconUrl === null
          ? null
          : input.iconUrl
    const nextTimezone = input.timezone?.trim() || org.timezone || "UTC"

    await db
      .update(organizations)
      .set({
        name: nextName,
        slug: nextSlug,
        iconUrl: nextIconUrl,
        timezone: nextTimezone,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, org.id))

    const [updated] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, org.id))
      .limit(1)
    return orgSummary(updated!, "owner")
  })

export const listMembers = authedProcedure
  .input(z.object({ organizationId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await requireOrgRole(input.organizationId, context.session!, "member")
    const rows = await db
      .select({
        id: organizationMembers.id,
        role: organizationMembers.role,
        createdAt: organizationMembers.createdAt,
        userId: user.id,
        name: user.name,
        email: user.email,
      })
      .from(organizationMembers)
      .innerJoin(user, eq(organizationMembers.userId, user.id))
      .where(eq(organizationMembers.organizationId, input.organizationId))

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: row.name,
      email: row.email,
      role: row.role as "owner" | "member",
      createdAt: row.createdAt.toISOString(),
    }))
  })

export const listInvites = authedProcedure
  .input(z.object({ organizationId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await requireOrgRole(input.organizationId, context.session!, "owner")
    const rows = await db
      .select()
      .from(organizationInvites)
      .where(
        and(
          eq(organizationInvites.organizationId, input.organizationId),
          isNull(organizationInvites.acceptedAt),
        ),
      )
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role as "owner" | "member",
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }))
  })

export const invite = writeProcedure
  .input(inviteOrganizationMemberInputSchema)
  .handler(async ({ context, input }) => {
    await requireOrgRole(input.organizationId, context.session!, "owner")
    const email = input.email.trim().toLowerCase()

    const [existingUser] = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1)
    if (existingUser) {
      const membership = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, input.organizationId),
            eq(organizationMembers.userId, existingUser.id),
          ),
        )
        .limit(1)
      if (membership.length) {
        throw new ORPCError("CONFLICT", {
          message: "User is already a member",
        })
      }
    }

    const token = generateInviteToken()
    const id = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
    await db.insert(organizationInvites).values({
      id,
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedByUserId: context.session!.user.id,
      expiresAt,
    })

    return {
      id,
      email,
      role: input.role,
      token,
      invitePath: `/invites/${token}`,
      expiresAt: expiresAt.toISOString(),
    }
  })

export const revokeInvite = writeProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const [invite] = await db
      .select()
      .from(organizationInvites)
      .where(eq(organizationInvites.id, input.id))
      .limit(1)
    if (!invite) {
      throw new ORPCError("NOT_FOUND", { message: "Invite not found" })
    }
    await requireOrgRole(invite.organizationId, context.session!, "owner")
    await db
      .delete(organizationInvites)
      .where(eq(organizationInvites.id, invite.id))
    return { ok: true as const }
  })

export const removeMember = writeProcedure
  .input(removeMemberInputSchema)
  .handler(async ({ context, input }) => {
    await requireOrgRole(input.organizationId, context.session!, "owner")
    if (input.userId === context.session!.user.id) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Cannot remove yourself; transfer ownership first",
      })
    }
    const owners = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.role, "owner"),
        ),
      )
    const [target] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.userId),
        ),
      )
      .limit(1)
    if (!target) {
      throw new ORPCError("NOT_FOUND", { message: "Member not found" })
    }
    if (target.role === "owner" && owners.length <= 1) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Cannot remove the last owner",
      })
    }
    await db
      .delete(organizationMembers)
      .where(eq(organizationMembers.id, target.id))
    return { ok: true as const }
  })

export const updateMemberRole = writeProcedure
  .input(updateMemberRoleInputSchema)
  .handler(async ({ context, input }) => {
    await requireOrgRole(input.organizationId, context.session!, "owner")
    const [target] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.userId),
        ),
      )
      .limit(1)
    if (!target) {
      throw new ORPCError("NOT_FOUND", { message: "Member not found" })
    }
    if (target.role === "owner" && input.role === "member") {
      const owners = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, input.organizationId),
            eq(organizationMembers.role, "owner"),
          ),
        )
      if (owners.length <= 1) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Cannot demote the last owner",
        })
      }
    }
    await db
      .update(organizationMembers)
      .set({ role: input.role })
      .where(eq(organizationMembers.id, target.id))
    return { ok: true as const }
  })

export const acceptInvite = writeProcedure
  .input(acceptInviteInputSchema)
  .handler(async ({ context, input }) => {
    const tokenHash = hashToken(input.token)
    const [invite] = await db
      .select()
      .from(organizationInvites)
      .where(eq(organizationInvites.tokenHash, tokenHash))
      .limit(1)
    if (!invite || invite.acceptedAt) {
      throw new ORPCError("NOT_FOUND", { message: "Invite not found" })
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new ORPCError("BAD_REQUEST", { message: "Invite has expired" })
    }
    const sessionEmail = context.session!.user.email.toLowerCase()
    if (sessionEmail !== invite.email.toLowerCase()) {
      throw new ORPCError("FORBIDDEN", {
        message: `Sign in as ${invite.email} to accept this invite`,
      })
    }

    const existing = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, invite.organizationId),
          eq(organizationMembers.userId, context.session!.user.id),
        ),
      )
      .limit(1)
    if (!existing.length) {
      await db.insert(organizationMembers).values({
        id: crypto.randomUUID(),
        organizationId: invite.organizationId,
        userId: context.session!.user.id,
        role: invite.role,
      })
    }

    await db
      .update(organizationInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(organizationInvites.id, invite.id))

    return {
      organizationId: invite.organizationId,
      setCookie: activeOrgSetCookie(invite.organizationId),
    }
  })

export const me = authedProcedure.handler(async ({ context }) => {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      instanceAdmin: user.instanceAdmin,
    })
    .from(user)
    .where(eq(user.id, context.session!.user.id))
    .limit(1)
  return {
    id: row!.id,
    name: row!.name,
    email: row!.email,
    instanceAdmin: Boolean(row!.instanceAdmin),
    activeOrgCookie: ACTIVE_ORG_COOKIE,
  }
})

/** Peek invite without auth for login redirect messaging */
export const peekInvite = publicProcedure
  .input(acceptInviteInputSchema)
  .handler(async ({ input }) => {
    const tokenHash = createHash("sha256").update(input.token).digest("hex")
    const [invite] = await db
      .select({
        email: organizationInvites.email,
        role: organizationInvites.role,
        expiresAt: organizationInvites.expiresAt,
        acceptedAt: organizationInvites.acceptedAt,
        orgName: organizations.name,
      })
      .from(organizationInvites)
      .innerJoin(
        organizations,
        eq(organizationInvites.organizationId, organizations.id),
      )
      .where(eq(organizationInvites.tokenHash, tokenHash))
      .limit(1)
    if (!invite || invite.acceptedAt) {
      throw new ORPCError("NOT_FOUND", { message: "Invite not found" })
    }
    return {
      email: invite.email,
      role: invite.role as "owner" | "member",
      orgName: invite.orgName,
      expiresAt: invite.expiresAt.toISOString(),
      expired: invite.expiresAt.getTime() < Date.now(),
    }
  })
