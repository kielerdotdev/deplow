import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"

export const Route = createFileRoute("/")({
  loader: async () => {
    const [health, session] = await Promise.all([
      client.health(),
      getSession(),
    ])
    return { health, session }
  },
  component: App,
})

function App() {
  const { health, session } = Route.useLoaderData()
  const [greeting, setGreeting] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleGreet() {
    setPending(true)
    try {
      const result = await client.greet({ name: "TanStack Start" })
      setGreeting(result.message)
    } finally {
      setPending(false)
    }
  }

  async function handleSignOut() {
    await authClient.signOut()
    window.location.href = "/"
  }

  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">oRPC + Drizzle + better-auth</h1>
          <p>
            SQLite via Drizzle · auth at{" "}
            <code className="text-xs">/api/auth</code> · RPC at{" "}
            <code className="text-xs">/api/rpc</code>
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <p className="font-medium">Session</p>
          {session?.user ? (
            <div className="mt-1 flex flex-col gap-2">
              <p>
                Signed in as <strong>{session.user.name}</strong> (
                {session.user.email})
              </p>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          ) : (
            <div className="mt-1 flex flex-col gap-2">
              <p>Not signed in.</p>
              <Link
                to="/login"
                className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-[0.8rem] font-medium"
              >
                Sign in
              </Link>
            </div>
          )}
        </div>

        <div className="rounded-lg border p-3">
          <p className="font-medium">SSR health check (oRPC)</p>
          <p>
            ok: <code>{String(health.ok)}</code>
          </p>
          <p>
            time: <code className="text-xs">{health.time}</code>
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <p className="font-medium">Client RPC call</p>
          <Button className="mt-2" disabled={pending} onClick={handleGreet}>
            {pending ? "Calling…" : "Call greet"}
          </Button>
          {greeting ? (
            <p className="mt-2">
              Response: <code>{greeting}</code>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
