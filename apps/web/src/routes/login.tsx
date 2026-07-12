import { useState } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import {
  BoxIcon,
  DatabaseIcon,
  RocketIcon,
  ShieldIcon,
  WorkflowIcon,
} from "lucide-react"

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
  component: LoginPage,
})

const highlights = [
  {
    icon: DatabaseIcon,
    title: "Full stack provisioned",
    description: "Postgres, Redis, and S3 wired together on every project.",
  },
  {
    icon: RocketIcon,
    title: "Deploy from Git",
    description: "Push to deploy with webhooks and injected credentials.",
  },
  {
    icon: ShieldIcon,
    title: "Sandboxed runtime",
    description: "User apps run under gVisor by default for isolation.",
  },
]

function LoginPage() {
  const navigate = useNavigate()
  const { redirect: redirectTo } = Route.useSearch()
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

      await navigate({ href: redirectTo || "/" })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-muted/40 p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,oklch(0.55_0.19_255/12%),transparent_55%)]"
        />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BoxIcon className="size-5" />
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">deplow</p>
            <p className="text-sm text-muted-foreground">Control plane</p>
          </div>
        </div>

        <div className="relative space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              Ship apps with infrastructure included
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Deploy web apps and workers with Postgres, Redis, and object
              storage already connected.
            </p>
          </div>

          <ul className="space-y-4">
            {highlights.map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <div className="icon-well size-9 shrink-0">
                  <item.icon className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          <WorkflowIcon className="mr-1.5 inline size-3.5 opacity-70" />
          Open source · self-hosted
        </p>
      </aside>

      <main className="flex flex-col items-center justify-center bg-background p-6 sm:p-10">
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BoxIcon className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">deplow</p>
            <p className="text-xs text-muted-foreground">Control plane</p>
          </div>
        </div>

        <Card className="w-full max-w-sm border-border shadow-[0_1px_2px_oklch(0_0_0/0.04)]">
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
      </main>
    </div>
  )
}
