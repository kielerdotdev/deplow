/**
 * Data-plane resource slots.
 *
 * v1 only creates `kind: "production"`. Preview slots (v2) re-use the same
 * naming helpers so production resource names never need a rename.
 */

export type SlotKind = "production" | "preview"

export interface ResourceSlot {
  projectId: string
  /** Stable project slug used for resource naming */
  slug: string
  kind: SlotKind
  /** e.g. "pr-42" for previews — ignored when kind is production */
  previewKey?: string
}

/** Production slot for a project (v1 default). */
export function productionSlot(projectId: string, slug: string): ResourceSlot {
  return { projectId, slug, kind: "production" }
}

/**
 * Derive a stable resource name suffix from a slot.
 * Production: `{slug}` (unchanged from v1).
 * Preview: `{slug}__{previewKey}` so destroy can target one slot.
 */
export function slotResourceName(slot: ResourceSlot): string {
  if (slot.kind === "production") {
    return slot.slug
  }
  const key = slot.previewKey?.replace(/[^a-z0-9-]/gi, "").toLowerCase()
  if (!key) {
    throw new Error("preview slot requires previewKey")
  }
  return `${slot.slug}__${key}`
}

/** Human label for UI / logs. */
export function slotLabel(slot: ResourceSlot): string {
  if (slot.kind === "production") return "production"
  return `preview:${slot.previewKey ?? "?"}`
}
