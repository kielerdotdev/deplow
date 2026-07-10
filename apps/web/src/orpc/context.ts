import type { Session } from "@/lib/auth"

export type OrpcContext = {
  headers: Headers
  session?: Session | null
}
