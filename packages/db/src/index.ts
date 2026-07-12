export { db } from "./client"
export * from "./schema"
export {
  ensureGitOAuthSchema,
  ensureIngressSchema,
  ensureMcpTokensSchema,
  ensureOrganizationsSchema,
  ensureServicesSchema,
} from "./ensure-schema"

// Re-export query helpers so consumers share one drizzle-orm instance with schema
export { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm"
