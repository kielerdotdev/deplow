import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { tanstackStartCookies } from "better-auth/tanstack-start"

import { db } from "@deplow/db"
import * as schema from "@deplow/db/auth-schema"
import { createPersonalOrganization } from "@/lib/access"
import { env } from "@/lib/env"

const isDev = env.isDev

export const auth = betterAuth({
  appName: "Hostrig",
  baseURL: env.betterAuthUrl,
  secret: env.betterAuthSecret,
  // Vite binds on all interfaces; allow LAN / Tailscale origins in dev.
  trustedOrigins: isDev ? ["*"] : [env.betterAuthUrl],
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      instanceAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          await createPersonalOrganization({
            userId: created.id,
            name: created.name,
            email: created.email,
          })
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  // Must be last so cookie setting works with TanStack Start
  plugins: [tanstackStartCookies()],
})

export type Session = typeof auth.$Infer.Session