import { z } from "zod"

export const organizationRoleSchema = z.enum(["owner", "member"])

export type OrganizationRole = z.infer<typeof organizationRoleSchema>

export const organizationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  iconUrl: z.string().nullable(),
  timezone: z.string(),
  role: organizationRoleSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type OrganizationSummary = z.infer<typeof organizationSummarySchema>

export const updateOrganizationInputSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .min(1)
    .max(64)
    .optional(),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
      message: "Use lowercase letters, numbers, and hyphens",
    })
    .optional(),
  iconUrl: z
    .union([z.string().url().max(2048), z.literal(""), z.null()])
    .optional(),
  timezone: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_+\-/]+$/, { message: "Invalid timezone" })
    .optional(),
})

export type UpdateOrganizationInput = z.infer<
  typeof updateOrganizationInputSchema
>

export const inviteOrganizationMemberInputSchema = z.object({
  organizationId: z.string().min(1),
  email: z.string().email(),
  role: organizationRoleSchema.default("member"),
})

export type InviteOrganizationMemberInput = z.infer<
  typeof inviteOrganizationMemberInputSchema
>

export const updateMemberRoleInputSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: organizationRoleSchema,
})

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleInputSchema>

export const removeMemberInputSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
})

export type RemoveMemberInput = z.infer<typeof removeMemberInputSchema>

export const acceptInviteInputSchema = z.object({
  token: z.string().min(1),
})

export type AcceptInviteInput = z.infer<typeof acceptInviteInputSchema>

export const setActiveOrganizationInputSchema = z.object({
  organizationId: z.string().min(1),
})

export type SetActiveOrganizationInput = z.infer<
  typeof setActiveOrganizationInputSchema
>