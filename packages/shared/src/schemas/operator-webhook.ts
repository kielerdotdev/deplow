import { z } from "zod"

/** Operator HTTPS notify webhook settings (DB singleton). */
export const operatorWebhookSettingsSchema = z.object({
  enabled: z.boolean(),
  url: z.string(),
  onFailure: z.boolean(),
  onSuccess: z.boolean(),
})

export type OperatorWebhookSettings = z.infer<
  typeof operatorWebhookSettingsSchema
>

export const updateOperatorWebhookInputSchema = z.object({
  enabled: z.boolean(),
  url: z
    .string()
    .max(2048)
    .transform((s) => s.trim())
    .refine(
      (s) => s === "" || /^https?:\/\//i.test(s),
      "URL must start with http:// or https://",
    ),
  onFailure: z.boolean(),
  onSuccess: z.boolean(),
  /** Set a new signing secret; null clears; omit leaves unchanged. */
  secret: z.string().min(8).max(256).nullable().optional(),
})

export type UpdateOperatorWebhookInput = z.infer<
  typeof updateOperatorWebhookInputSchema
>
