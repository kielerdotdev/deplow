import { useState } from "react"
import {
  createFileRoute,
  Link,
  useRouter,
} from "@tanstack/react-router"
import { BoxIcon, UsersIcon } from "lucide-react"

import { applyOrgCookie } from "@/components/org-switcher"
import { OrgAvatar, RoleBadge } from "@/components/org-ui"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"

export const Route = createFileRoute("/invites/$token")({
  loader: async ({ params }) => {
    const peek = await client.organizations.peekInvite({ token: params.token })
    const session = await getSession()
    return { peek, session, token: params.token }
  },
  component: InvitePage,
})

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.55_0.19_255/10%),transparent_55%)]"
      />
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BoxIcon className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">deplow</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function InvitePage() {
  const { peek, session, token } = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function accept() {
    setPending(true)
    setError(null)
    try {
      const result = await client.organizations.acceptInvite({ token })
      applyOrgCookie(result.setCookie)
      await router.navigate({ to: "/" })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  if (peek.expired) {
    return (
      <InviteShell>
        <div className="surface-panel space-y-4 p-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <UsersIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">
              Invite expired
            </h1>
            <p className="text-sm text-muted-foreground">
              Ask an organization owner to send a new invite link.
            </p>
          </div>
          <Button render={<Link to="/" />}>Back to deplow</Button>
        </div>
      </InviteShell>
    )
  }

  if (!session) {
    return (
      <InviteShell>
        <div className="surface-panel space-y-5 p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <OrgAvatar name={peek.orgName} size="lg" />
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight">
                Join {peek.orgName}
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Sign in as{" "}
                <span className="font-medium text-foreground">
                  {peek.email}
                </span>{" "}
                to accept this invite.
              </p>
            </div>
            <RoleBadge role={peek.role} />
          </div>
          <Button
            className="w-full"
            render={
              <Link
                to="/login"
                search={{ redirect: `/invites/${token}` }}
              />
            }
          >
            Continue to sign in
          </Button>
        </div>
      </InviteShell>
    )
  }

  const wrongAccount =
    session.user.email.toLowerCase() !== peek.email.toLowerCase()

  return (
    <InviteShell>
      <div className="surface-panel space-y-5 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <OrgAvatar name={peek.orgName} size="lg" />
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">
              Join {peek.orgName}
            </h1>
            <p className="text-sm text-muted-foreground">
              You&apos;ll join with{" "}
              <span className="font-medium text-foreground">{peek.role}</span>{" "}
              access.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 text-center text-xs text-muted-foreground">
          Signed in as{" "}
          <span className="font-medium text-foreground">
            {session.user.email}
          </span>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not accept</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {wrongAccount ? (
          <Alert>
            <AlertTitle>Wrong account</AlertTitle>
            <AlertDescription>
              This invite is for {peek.email}. Sign out and use that email.
            </AlertDescription>
          </Alert>
        ) : (
          <Button
            className="w-full"
            disabled={pending}
            onClick={() => void accept()}
          >
            {pending ? "Joining…" : "Accept invite"}
          </Button>
        )}
      </div>
    </InviteShell>
  )
}
