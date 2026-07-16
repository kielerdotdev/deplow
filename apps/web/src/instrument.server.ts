/**
 * Server Sentry init for Observe dogfood.
 * Loaded first from `server.ts`.
 */
import * as Sentry from "@sentry/node"
import type { NodeOptions } from "@sentry/node"

import { env } from "./lib/env"
import { dogfoodSentryOptions } from "./lib/observe/dogfood"

let initialized = false

export function initDogfoodSentryServer(dsn: string) {
  if (initialized || !dsn) return
  Sentry.init(dogfoodSentryOptions(dsn) as unknown as NodeOptions)
  initialized = true
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
