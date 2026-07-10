import path from "node:path"
import { fileURLToPath } from "node:url"
import "dotenv/config"
import { defineConfig } from "drizzle-kit"

const packageRoot = path.dirname(fileURLToPath(import.meta.url))
const databaseUrl = process.env.DATABASE_URL ?? "data/deplow.db"
const resolvedUrl = path.isAbsolute(databaseUrl)
  ? databaseUrl
  : path.join(packageRoot, databaseUrl)

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: resolvedUrl,
  },
})
