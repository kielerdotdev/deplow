import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { isSignupAllowed } from "@/lib/access"
import { auth } from "@/lib/auth"

export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const headers = getRequestHeaders()
    return auth.api.getSession({ headers })
  },
)

/** Public: whether email/password sign-up is open on this instance. */
export const getSignupStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const allowed = await isSignupAllowed()
    return { allowed } as const
  },
)

export const ensureSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })

    if (!session) {
      throw new Error("Unauthorized")
    }

    return session
  },
)
