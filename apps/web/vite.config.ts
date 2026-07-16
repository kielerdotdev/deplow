import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(rootDir, "../..")

/**
 * App Vite config (TanStack Start).
 * Root `vite.config.ts` owns Oxlint / Oxfmt / Vitest defaults via Vite+.
 */
export default defineConfig(({ mode }) => {
  const loaded = {
    ...loadEnv(mode, repoRoot, ""),
    ...loadEnv(mode, rootDir, ""),
  }
  const dogfoodDsn =
    loaded.DEPLOW_OBSERVE_DOGFOOD_DSN ||
    loaded.VITE_DEPLOW_OBSERVE_DOGFOOD_DSN ||
    ""

  return {
    resolve: { tsconfigPaths: true },
    define: {
      "import.meta.env.VITE_DEPLOW_OBSERVE_DOGFOOD_DSN":
        JSON.stringify(dogfoodDsn),
    },
    plugins: [tailwindcss(), tanstackStart(), viteReact()],
    ssr: {
      external: [
        "better-sqlite3",
        "dockerode",
        "pg",
        "ioredis",
        "bullmq",
        "@sentry/node",
        "@clickhouse/client",
      ],
    },
    optimizeDeps: {
      // Keep Node-only observe deps out of the browser prebundle.
      exclude: [
        "better-sqlite3",
        "dockerode",
        "bullmq",
        "@clickhouse/client",
        "@deplow/observe",
      ],
      include: ["@sentry/react"],
    },
    server: {
      port: 3000,
    },
  }
})
