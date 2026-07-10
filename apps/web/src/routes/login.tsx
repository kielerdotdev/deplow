import { useState } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { BoxIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/30 p-6">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <BoxIcon className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">deplow</p>
          <p className="text-xs text-muted-foreground">Project runtime</p>
        </div>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </CardTitle>
          <CardDescription>
            Email and password via better-auth. One project includes Postgres,
            Redis, and S3.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-4">
            {mode === "sign-up" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={
                  mode === "sign-up" ? "new-password" : "current-password"
                }
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>
                  {mode === "sign-in" ? "Sign in failed" : "Sign up failed"}
                </AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" disabled={pending} className="w-full">
              {pending
                ? "Working…"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"))
                setError(null)
              }}
            >
              {mode === "sign-in"
                ? "Need an account? Sign up"
                : "Already have an account? Sign in"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
