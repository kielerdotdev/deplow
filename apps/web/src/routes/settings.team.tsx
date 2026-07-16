import { useState } from "react"
import {
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import {
  Building2Icon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { CopyField } from "@/components/copy-field"
import { EmptyState } from "@/components/empty-state"
import { RoleBadge } from "@/components/org-ui"
import {
  PageContent,
  PageHeader,
  SettingsPanel,
} from "@/components/page-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/settings/team")({
  loader: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: "/login", search: { redirect: undefined } })
    const shell = await loadShellContext()
    if (!shell.activeOrganization) {
      throw redirect({ to: "/" })
    }
    const orgId = shell.activeOrganization.id
    const [members, invites] = await Promise.all([
      client.organizations.listMembers({ organizationId: orgId }),
      shell.activeOrganization.role === "owner"
        ? client.organizations.listInvites({ organizationId: orgId })
        : Promise.resolve([]),
    ])
    return { session, shell, members, invites }
  },
  component: OrganizationPage,
})

function InviteMemberDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
}) {
  if (!open) return null
  return (
    <InviteMemberDialogBody
      organizationId={organizationId}
      onOpenChange={onOpenChange}
    />
  )
}

function InviteMemberDialogBody({
  organizationId,
  onOpenChange,
}: {
  organizationId: string
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"member" | "owner">("member")
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    onOpenChange(false)
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const result = await client.organizations.invite({
        organizationId,
        email,
        role,
      })
      setInviteLink(`${window.location.origin}${result.invitePath}`)
      setEmail("")
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      icon={UserPlusIcon}
      title="Invite someone"
      description="Creates a shareable link. No email is sent — copy it and pass it along."
      footer={
        inviteLink ? (
          <Button type="button" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button
              type="submit"
              form="invite-member-form"
              disabled={pending || !email.trim()}
            >
              {pending ? "Creating…" : "Create invite link"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </Button>
          </>
        )
      }
    >
      {inviteLink ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Invite created. Copy this link and send it to your teammate.
          </p>
          <CopyField value={inviteLink} />
        </div>
      ) : (
        <form
          id="invite-member-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => void handleInvite(e)}
        >
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not create invite</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "owner")}
              disabled={pending}
            >
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
          </div>
        </form>
      )}
    </ActionDialog>
  )
}

function OrganizationPage() {
  const { session, shell, members, invites } = Route.useLoaderData()
  const router = useRouter()
  const org = shell.activeOrganization!
  const isOwner = org.role === "owner"

  const [name, setName] = useState(org.name)
  const [slug, setSlug] = useState(org.slug)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  async function saveOrg(event: React.FormEvent) {
    event.preventDefault()
    if (!isOwner) return
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      await client.organizations.update({
        id: org.id,
        name,
        slug,
      })
      setSaved(true)
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  const inviteButton = isOwner ? (
    <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
      <UserPlusIcon data-icon="inline-start" />
      Invite
    </Button>
  ) : null

  return (
    <>
      <PageHeader
        title="Team"
        description="Members and organization settings"
      />

      <PageContent width="narrow">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <SettingsPanel
          icon={UsersIcon}
          title="Members"
          description="Everyone here can view and operate projects in this organization."
          action={inviteButton}
          flush
        >
          {members.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="No members yet"
              description="Invite a teammate to collaborate on projects."
              size="sm"
              action={inviteButton ?? undefined}
            />
          ) : (
            <ul className="divide-y divide-border">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 px-5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.name}
                      {member.userId === session.user.id ? (
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          (you)
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <RoleBadge role={member.role} />
                    {isOwner && member.userId !== session.user.id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={async () => {
                          setPending(true)
                          setError(null)
                          try {
                            await client.organizations.removeMember({
                              organizationId: org.id,
                              userId: member.userId,
                            })
                            await router.invalidate()
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : String(e),
                            )
                          } finally {
                            setPending(false)
                          }
                        }}
                      >
                        <Trash2Icon className="size-3.5" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isOwner && invites.length > 0 ? (
            <div className="border-t border-border/60 px-5 py-4">
              <p className="mb-2 text-sm font-medium">Pending invites</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {invites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {invite.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Expires{" "}
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <RoleBadge role={invite.role} />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={async () => {
                          setPending(true)
                          try {
                            await client.organizations.revokeInvite({
                              id: invite.id,
                            })
                            await router.invalidate()
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : String(e),
                            )
                          } finally {
                            setPending(false)
                          }
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SettingsPanel>

        <SettingsPanel
          icon={Building2Icon}
          title="General"
          description={
            isOwner
              ? "Displayed name and URL-safe slug for this organization."
              : "Only owners can rename this organization."
          }
          footer={
            isOwner ? (
              <>
                <Button
                  type="submit"
                  form="org-general-form"
                  size="sm"
                  disabled={pending}
                >
                  {pending ? "Saving…" : "Save changes"}
                </Button>
                {saved ? (
                  <span className="text-xs text-muted-foreground">Saved</span>
                ) : null}
              </>
            ) : undefined
          }
        >
          <form
            id="org-general-form"
            className="grid gap-4"
            onSubmit={saveOrg}
          >
            <div className="space-y-2">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwner || pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={!isOwner || pending}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Used in identifiers. Prefer lowercase letters, numbers, and
                hyphens.
              </p>
            </div>
          </form>
        </SettingsPanel>
      </PageContent>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={org.id}
      />
    </>
  )
}
