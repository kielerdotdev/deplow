import { useState } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"

import { SoftHit } from "@/components/soft-hit"
import { HostrigLogo } from "@/components/hostrig-logo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { getSession, getSignupStatus } from "@/lib/auth.functions"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect:
      typeof search.redirect === "string" && search.redirect.startsWith("/")
        ? search.redirect
        : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const session = await getSession()
    if (session) {
      throw redirect({ to: search.redirect || "/" })
    }
  },
  loader: async () => {
    const signup = await getSignupStatus()
    return { signupAllowed: signup.allowed }
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const { redirect: redirectTo } = Route.useSearch()
  const { signupAllowed } = Route.useLoaderData()
  // Bootstrap: first admin should land on create-account, not a dead-end sign-in form.
  const [mode, setMode] = useState<"sign-in" | "sign-up">(
    signupAllowed ? "sign-up" : "sign-in",
  )
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const showSignUp = signupAllowed && mode === "sign-up"

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      if (showSignUp) {
        const { error: signUpError } = await authClient.signUp.email({
          name,
          email,
          password,
        })
        if (signUpError) {
          setError(
            signUpError.message?.trim() ||
              "Could not create account. Try again or ask an admin for an invite.",
          )
          return
        }
      } else {
        const { error: signInError } = await authClient.signIn.email({
          email,
          password,
        })
        if (signInError) {
          setError(
            signInError.message?.trim() ||
              "Sign in failed. Check your email and password.",
          )
          return
        }
      }

      await navigate({ href: redirectTo || "/" })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-sm bg-shell/80 backdrop-blur-xl">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
          <div className="flex size-8 items-center justify-center">
            <HostrigLogo size={20} className="text-foreground" />
          </div>
          <span className="text-[14px] font-medium text-foreground">Hostrig</span>
        </div>

        <div className="mx-1 mb-1 flex flex-col rounded-sm bg-shell-panel/80">
          <div className="flex h-12 items-center border-b border-border px-4">
            <span className="text-[14px] font-medium text-foreground">
              {showSignUp ? "Create account" : "Sign in"}
            </span>
            <span className="ml-3 hidden truncate text-[14px] text-shell-faint sm:inline">
              {showSignUp
                ? "First user becomes the instance admin"
                : "Email and password"}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
            {signupAllowed && showSignUp ? (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Welcome. Create the first admin account for this Hostrig
                instance, then connect a k3s cluster and deploy.
              </p>
            ) : null}

            {!signupAllowed ? (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                This instance is invite-only. Sign in with your account, or ask
                an admin for an invite link.
              </p>
            ) : null}

            {showSignUp ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-[13px] text-muted-foreground">
                  Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  autoFocus
                  className="h-9 rounded-sm border-border bg-transparent"
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[13px] text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus={!showSignUp}
                className="h-9 rounded-sm border-border bg-transparent"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="password"
                className="text-[13px] text-muted-foreground"
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={
                  showSignUp ? "new-password" : "current-password"
                }
                className="h-9 rounded-sm border-border bg-transparent"
              />
              {showSignUp ? (
                <p className="text-[12px] text-shell-faint">
                  At least 8 characters.
                </p>
              ) : null}
            </div>

            {error ? (
              <p className="text-[13px] text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-2 pt-1">
              {signupAllowed ? (
                <button
                  type="button"
                  className={cn(
                    "text-[13px] text-muted-foreground transition-colors hover:text-foreground",
                  )}
                  onClick={() => {
                    setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"))
                    setError(null)
                  }}
                >
                  {mode === "sign-in" ? "Create account" : "Sign in instead"}
                </button>
              ) : (
                <span aria-hidden className="min-w-0" />
              )}

              <SoftHit as="button" type="submit" tone="solid" disabled={pending}>
                <span className="flex h-8 items-center px-3 text-[13px] font-medium text-foreground">
                  {pending
                    ? "Working…"
                    : showSignUp
                      ? "Create account"
                      : "Sign in"}
                </span>
              </SoftHit>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
