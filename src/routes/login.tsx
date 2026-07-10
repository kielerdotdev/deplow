import { useState } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { getSession } from "@/lib/auth.functions"

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const session = await getSession()
    if (session) {
      throw redirect({ to: "/" })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      if (mode === "sign-up") {
        const { error: signUpError } = await authClient.signUp.email({
          name,
          email,
          password,
        })
        if (signUpError) {
          setError(signUpError.message ?? "Sign up failed")
          return
        }
      } else {
        const { error: signInError } = await authClient.signIn.email({
          email,
          password,
        })
        if (signInError) {
          setError(signInError.message ?? "Sign in failed")
          return
        }
      }

      await navigate({ to: "/" })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-3 rounded-xl border p-6 text-sm"
      >
        <div>
          <h1 className="text-base font-medium">
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Email + password via better-auth
          </p>
        </div>

        {mode === "sign-up" ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Name</span>
            <input
              className="rounded-md border px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Email</span>
          <input
            type="email"
            className="rounded-md border px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Password</span>
          <input
            type="password"
            className="rounded-md border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
          />
        </label>

        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="mt-1">
          {pending
            ? "Working…"
            : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
        </Button>

        <button
          type="button"
          className="text-muted-foreground text-xs underline-offset-2 hover:underline"
          onClick={() => {
            setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"))
            setError(null)
          }}
        >
          {mode === "sign-in"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  )
}
