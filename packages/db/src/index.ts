export { db } from "./client"
export * from "./schema"

// Re-export query helpers so consumers share one drizzle-orm instance with schema
export { and, asc, desc, eq, ne, or, sql } from "drizzle-orm"
