import { useState } from "react"
import {
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import {
  Building2Icon,
  CheckIcon,
  CopyIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { AppShell } from "@/components/app-shell"
import { EmptyState } from "@/components/empty-state"
import { OrgAvatar, PersonAvatar, RoleBadge } from "@/components/org-ui"
import {
  SettingsField,
  SettingsHint,
  SettingsSection,
} from "@/components/settings-section"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/organization")({
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
  const [copied, setCopied] = useState(false)
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

  async function copyInvite(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
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
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground">
              {inviteLink}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyInvite(inviteLink)}
            >
              {copied ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <CopyIcon data-icon="inline-start" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
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

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      accountHome
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-wrap items-start gap-4">
          <OrgAvatar name={org.name} id={org.id} size="lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {org.name}
              </h1>
              <RoleBadge role={org.role} />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-[13px]">{org.slug}</span>
              <span className="mx-2 text-border">·</span>
              {members.length} {members.length === 1 ? "member" : "members"}
              {invites.length > 0
                ? ` · ${invites.length} pending invite${invites.length === 1 ? "" : "s"}`
                : null}
            </p>
          </div>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <SettingsSection
          icon={UsersIcon}
          title="Members"
          action={
            isOwner ? (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlusIcon data-icon="inline-start" />
                Invite
              </Button>
            ) : null
          }
        >
          <SettingsHint>
            Everyone here can view and operate projects in this organization.
            Owners can invite people and change settings.
          </SettingsHint>

          {members.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="No members yet"
              description="Invite a teammate to collaborate on projects."
              size="sm"
              className="rounded-xl border border-border/70"
              action={
                isOwner ? (
                  <Button size="sm" onClick={() => setInviteOpen(true)}>
                    <UserPlusIcon data-icon="inline-start" />
                    Invite
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="overflow-hidden rounded-xl border border-border/80">
              {members.map((member, index) => (
                <li
                  key={member.id}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-3",
                    index > 0 && "border-t border-border/70",
                  )}
                >
                  <PersonAvatar name={member.name} email={member.email} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {member.name}
                      </span>
                      {member.userId === session.user.id ? (
                        <span className="text-[11px] text-muted-foreground">
                          you
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </div>
                  </div>
                  <RoleBadge role={member.role} />
                  {isOwner && member.userId !== session.user.id ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={pending}
                      aria-label={`Remove ${member.name}`}
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
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {isOwner && invites.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Pending invites
              </p>
              <ul className="overflow-hidden rounded-xl border border-border/80">
                {invites.map((invite, index) => (
                  <li
                    key={invite.id}
                    className={cn(
                      "flex items-center gap-3 px-3.5 py-3",
                      index > 0 && "border-t border-border/70",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {invite.email}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Expires{" "}
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
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
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SettingsSection>

        <SettingsSection icon={Building2Icon} title="General">
          <SettingsHint>
            {isOwner
              ? "Displayed name and URL-safe slug for this organization."
              : "Only owners can rename this organization."}
          </SettingsHint>
          <form className="grid gap-4" onSubmit={saveOrg}>
            <SettingsField label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwner || pending}
              />
            </SettingsField>
            <SettingsField
              label="Slug"
              description="Used in identifiers. Prefer lowercase letters, numbers, and hyphens."
            >
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={!isOwner || pending}
                className="font-mono text-sm"
              />
            </SettingsField>
            {isOwner ? (
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save changes"}
                </Button>
                {saved ? (
                  <span className="text-xs text-success">Saved</span>
                ) : null}
              </div>
            ) : null}
          </form>
        </SettingsSection>
      </div>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={org.id}
      />
    </AppShell>
  )
}
