import type {
  DatabaseCredentials,
  RedisCredentials,
  ResourceCredentials,
  ResourceKind,
  StorageCredentials,
} from "@deplow/shared"

import type { BackupKind } from "../backup.service"
import type { PitrWindow } from "../pitr.service"

export type ResourceCapabilities = {
  backup: boolean
  pitr: boolean
  principals: boolean
  exportImport: boolean
}

export type ProvisionContext = {
  projectId: string
  projectSlug: string
  resourceLinkId: string
  /** Workload name for k8s resource naming (defaults per kind when omitted). */
  serviceName?: string
}

export type DestroyContext = ProvisionContext & {
  credentials: ResourceCredentials | null
}

export type BackupResult = {
  body: Buffer
  contentType: string
  kind: BackupKind
  keySuffix: string
}

export type PrincipalInfo = {
  name: string
  isPrimary: boolean
  meta?: Record<string, unknown>
}

export type CreatedPrincipal = {
  name: string
  password: string
}

export interface BackupCapable {
  backup(credentials: ResourceCredentials): Promise<BackupResult>
  restore(credentials: ResourceCredentials, body: Buffer): Promise<void>
}

export interface PitrCapable {
  status(
    ctx: ProvisionContext & { credentials: ResourceCredentials },
  ): Promise<PitrWindow>
  restoreToTime(
    ctx: ProvisionContext & { credentials: ResourceCredentials },
    targetAt: Date,
  ): Promise<void>
}

export interface PrincipalsCapable {
  list(
    credentials: ResourceCredentials,
    projectSlug: string,
  ): Promise<PrincipalInfo[]>
  create(
    credentials: ResourceCredentials,
    projectSlug: string,
    name: string,
    options?: { preset?: string },
  ): Promise<CreatedPrincipal>
  rotate(
    credentials: ResourceCredentials,
    projectSlug: string,
    name: string,
  ): Promise<CreatedPrincipal>
  drop(
    credentials: ResourceCredentials,
    projectSlug: string,
    name: string,
  ): Promise<void>
  /** When primary principal password rotates, return updated credentials. */
  applyPrimaryRotation?(
    credentials: ResourceCredentials,
    projectSlug: string,
    name: string,
    password: string,
  ): ResourceCredentials | null
}

export interface ExportImportCapable {
  export(credentials: ResourceCredentials, projectSlug: string): Promise<Buffer>
  import(
    credentials: ResourceCredentials,
    projectSlug: string,
    body: Buffer,
  ): Promise<number>
}

export interface DataServiceDriver {
  readonly kind: ResourceKind
  readonly source: "dedicated-container" | "shared-instance"
  readonly capabilities: ResourceCapabilities
  /** Default env key when binding this resource into a consumer service. */
  readonly defaultEnvKey?: string
  provision(ctx: ProvisionContext): Promise<ResourceCredentials>
  destroy(ctx: DestroyContext): Promise<void>
  backup?: BackupCapable
  pitr?: PitrCapable
  principals?: PrincipalsCapable
  exportImport?: ExportImportCapable
}

export type { DatabaseCredentials, RedisCredentials, StorageCredentials }
