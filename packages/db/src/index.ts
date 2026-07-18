export { db, getSqlite } from "./client"
export * from "./schema"
export {
  ensureAgentNodesSchema,
  ensureClustersSchema,
  ensureContainerRegistriesSchema,
  ensureGitOAuthSchema,
  ensureIngressSchema,
  ensureMcpTokensSchema,
  ensureOrganizationsSchema,
  ensureObserveSchema,
  ensureServicesSchema,
} from "./ensure-schema"

// Re-export query helpers so consumers share one drizzle-orm instance with schema
export { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm"
