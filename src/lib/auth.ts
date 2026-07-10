import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { tanstackStartCookies } from "better-auth/tanstack-start"

import { db } from "@/lib/db"
import * as schema from "@/lib/db/auth-schema"

function getBaseUrl() {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  )
}

export const auth = betterAuth({
  appName: "Deplow",
  baseURL: getBaseUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  // Must be last so cookie setting works with TanStack Start
  plugins: [tanstackStartCookies()],
})

export type Session = typeof auth.$Infer.Session
