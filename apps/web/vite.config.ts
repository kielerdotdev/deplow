import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

/**
 * App Vite config (TanStack Start).
 * Root `vite.config.ts` owns Oxlint / Oxfmt / Vitest defaults via Vite+.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  ssr: {
    external: ["better-sqlite3", "dockerode", "pg", "ioredis", "bullmq"],
  },
  optimizeDeps: {
    exclude: ["better-sqlite3", "dockerode", "bullmq"],
  },
  server: {
    port: 3000,
  },
})
