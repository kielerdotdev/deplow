/**
 * Server Sentry init for Observe dogfood.
 * Loaded first from `server.ts`.
 */
import * as Sentry from "@sentry/node"
import type { NodeOptions } from "@sentry/node"

import { env } from "./lib/env"
import { dogfoodSentryOptions } from "./lib/observe/dogfood"

const SENTRY_GLOBAL_KEY = "__deplowDogfoodSentry"

export function initDogfoodSentryServer(dsn: string) {
  const g = globalThis as typeof globalThis & {
    [SENTRY_GLOBAL_KEY]?: boolean
  }
  if (g[SENTRY_GLOBAL_KEY] || !dsn) return
  Sentry.init(dogfoodSentryOptions(dsn) as unknown as NodeOptions)
  g[SENTRY_GLOBAL_KEY] = true
  console.info(
    "[observe-dogfood] server Sentry →",
    dsn.replace(/\/\/.*@/, "//***@"),
  )
}

const bootDsn = env.observeDogfood ? env.observeDogfoodDsn : ""
if (bootDsn) {
  initDogfoodSentryServer(bootDsn)
}

export { Sentry }
