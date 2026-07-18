import { and, asc, eq, db, containerRegistries } from "@hostrig/db"
import type {
  ContainerRegistry,
  CreateRegistryInput,
  RegistryKind,
  UpdateRegistryInput,
} from "@hostrig/shared"

import { decryptString, encryptString } from "@/lib/core/crypto"
import { env } from "@/lib/env"

import {
  normalizeImagePrefix,
  resolveRegistryServer,
} from "./kinds"

export type RegistryRow = typeof containerRegistries.$inferSelect

export type ResolvedRegistry = {
  id: string
  name: string
  kind: RegistryKind
  server: string
  imagePrefix: string
  username: string
  password: string
  hasAuth: boolean
  isDefaultBuild: boolean
  enabled: boolean
}

function secretKey(): string {
  return env.secretsEncryptionKey
}

function toPublic(row: RegistryRow): ContainerRegistry {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as RegistryKind,
    server: row.server,
    imagePrefix: row.imagePrefix,
    username: row.username,
    hasPassword: Boolean(row.passwordEncrypted),
    isDefaultBuild: Boolean(row.isDefaultBuild),
    enabled: Boolean(row.enabled),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function resolveRow(row: RegistryRow): ResolvedRegistry {
  const password = row.passwordEncrypted
    ? decryptString(row.passwordEncrypted, secretKey())
    : ""
  const username = row.username?.trim() ?? ""
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as RegistryKind,
    server: row.server,
    imagePrefix: row.imagePrefix,
    username,
    password,
    hasAuth: Boolean(username && password),
    isDefaultBuild: Boolean(row.isDefaultBuild),
    enabled: Boolean(row.enabled),
  }
}

/** Seed from HOSTRIG_BUILD_REGISTRY* when the table is empty. */
export async function seedRegistriesFromEnvIfEmpty(): Promise<void> {
  const existing = await db.select({ id: containerRegistries.id }).from(containerRegistries).limit(1)
  if (existing.length > 0) return

  const prefix = env.buildRegistry
  if (!prefix) return

  const server = env.buildRegistryServer || prefix.split("/")[0] || prefix
  const username = env.buildRegistryUsername || null
  const password = env.buildRegistryPassword
  const id = crypto.randomUUID()
  await db.insert(containerRegistries).values({
    id,
    name: "Default (from env)",
    kind: "generic",
    server,
    imagePrefix: normalizeImagePrefix(prefix),
    username,
    passwordEncrypted: password
      ? encryptString(password, secretKey())
      : null,
    isDefaultBuild: true,
    enabled: true,
  })
}

export async function listRegistries(): Promise<ContainerRegistry[]> {
  await seedRegistriesFromEnvIfEmpty()
  const rows = await db
    .select()
    .from(containerRegistries)
    .orderBy(asc(containerRegistries.name))
  return rows.map(toPublic)
}

export async function getRegistryRow(id: string): Promise<RegistryRow | null> {
  const [row] = await db
    .select()
    .from(containerRegistries)
    .where(eq(containerRegistries.id, id))
    .limit(1)
  return row ?? null
}

export async function resolveDefaultBuildRegistry(): Promise<ResolvedRegistry | null> {
  await seedRegistriesFromEnvIfEmpty()
  const [row] = await db
    .select()
    .from(containerRegistries)
    .where(
      and(
        eq(containerRegistries.isDefaultBuild, true),
        eq(containerRegistries.enabled, true),
      ),
    )
    .limit(1)
  if (row) return resolveRow(row)

  // Fallback: first enabled registry
  const [any] = await db
    .select()
    .from(containerRegistries)
    .where(eq(containerRegistries.enabled, true))
    .orderBy(asc(containerRegistries.createdAt))
    .limit(1)
  return any ? resolveRow(any) : null
}

/** All enabled registries that have credentials (for imagePullSecrets). */
export async function resolveCredentialedRegistries(): Promise<
  ResolvedRegistry[]
> {
  await seedRegistriesFromEnvIfEmpty()
  const rows = await db
    .select()
    .from(containerRegistries)
    .where(eq(containerRegistries.enabled, true))
  return rows.map(resolveRow).filter((r) => r.hasAuth)
}

export async function createRegistry(
  input: CreateRegistryInput,
): Promise<ContainerRegistry> {
  const kind = input.kind
  const server = resolveRegistryServer(kind, input.server)
  const imagePrefix = normalizeImagePrefix(input.imagePrefix)
  if (!imagePrefix) throw new Error("imagePrefix is required")

  const id = crypto.randomUUID()
  const count = await countRegistries()
  // First registry always becomes build default unless explicitly disabled later.
  const makeDefault = count === 0 || input.isDefaultBuild === true

  if (makeDefault) {
    await clearDefaultBuild()
  }

  const password = input.password?.trim() || ""
  await db.insert(containerRegistries).values({
    id,
    name: input.name.trim(),
    kind,
    server,
    imagePrefix,
    username: input.username?.trim() || null,
    passwordEncrypted: password
      ? encryptString(password, secretKey())
      : null,
    isDefaultBuild: makeDefault,
    enabled: input.enabled !== false,
  })

  const row = await getRegistryRow(id)
  if (!row) throw new Error("Failed to create registry")
  return toPublic(row)
}

export async function updateRegistry(
  input: UpdateRegistryInput,
): Promise<ContainerRegistry> {
  const existing = await getRegistryRow(input.id)
  if (!existing) throw new Error("Registry not found")

  const kind = (input.kind ?? existing.kind) as RegistryKind
  const server =
    input.server !== undefined || input.kind
      ? resolveRegistryServer(kind, input.server ?? existing.server)
      : existing.server

  const imagePrefix =
    input.imagePrefix !== undefined
      ? normalizeImagePrefix(input.imagePrefix)
      : existing.imagePrefix

  let passwordEncrypted = existing.passwordEncrypted
  if (input.password !== undefined && input.password !== null) {
    const p = input.password.trim()
    passwordEncrypted = p ? encryptString(p, secretKey()) : null
  }

  if (input.isDefaultBuild === true) {
    await clearDefaultBuild()
  }

  await db
    .update(containerRegistries)
    .set({
      name: input.name?.trim() ?? existing.name,
      kind,
      server,
      imagePrefix,
      username:
        input.username !== undefined
          ? input.username?.trim() || null
          : existing.username,
      passwordEncrypted,
      isDefaultBuild:
        input.isDefaultBuild !== undefined
          ? input.isDefaultBuild
          : existing.isDefaultBuild,
      enabled:
        input.enabled !== undefined ? input.enabled : existing.enabled,
    })
    .where(eq(containerRegistries.id, input.id))

  const row = await getRegistryRow(input.id)
  if (!row) throw new Error("Registry not found after update")
  return toPublic(row)
}

export async function deleteRegistry(id: string): Promise<void> {
  const existing = await getRegistryRow(id)
  if (!existing) throw new Error("Registry not found")
  const wasDefault = existing.isDefaultBuild
  await db.delete(containerRegistries).where(eq(containerRegistries.id, id))
  if (wasDefault) {
    const [next] = await db
      .select()
      .from(containerRegistries)
      .where(eq(containerRegistries.enabled, true))
      .orderBy(asc(containerRegistries.createdAt))
      .limit(1)
    if (next) {
      await db
        .update(containerRegistries)
        .set({ isDefaultBuild: true })
        .where(eq(containerRegistries.id, next.id))
    }
  }
}

export async function setDefaultBuildRegistry(
  id: string,
): Promise<ContainerRegistry> {
  const existing = await getRegistryRow(id)
  if (!existing) throw new Error("Registry not found")
  if (!existing.enabled) {
    throw new Error("Cannot set a disabled registry as the build default")
  }
  await clearDefaultBuild()
  await db
    .update(containerRegistries)
    .set({ isDefaultBuild: true })
    .where(eq(containerRegistries.id, id))
  const row = await getRegistryRow(id)
  if (!row) throw new Error("Registry not found")
  return toPublic(row)
}

async function clearDefaultBuild(): Promise<void> {
  await db
    .update(containerRegistries)
    .set({ isDefaultBuild: false })
    .where(eq(containerRegistries.isDefaultBuild, true))
}

async function countRegistries(): Promise<number> {
  const rows = await db.select({ id: containerRegistries.id }).from(containerRegistries)
  return rows.length
}
