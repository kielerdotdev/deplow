import { useState } from "react"
import {
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import {
  EllipsisIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import { CopyField } from "@/components/copy-field"
import { EmptyState } from "@/components/empty-state"
import { RoleBadge } from "@/components/org-ui"
import { SettingsPage, SettingsPanel } from "@/components/page-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/settings/members")({
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
  component: MembersPage,
})

function isLikelyServiceAccount(member: {
  name: string
  email: string
}): boolean {
  const email = member.email.toLowerCase()
  return (
    email.endsWith("@example.com") ||
    email.includes("+bot@") ||
    email.includes("noreply") ||
    /service[_\s-]?account/i.test(member.name)
  )
}

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
              {pending ? "Creating…" : "Invite member"}
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

function MembersPage() {
  const { session, shell, members, invites } = Route.useLoaderData()
  const router = useRouter()
  const org = shell.activeOrganization!
  const isOwner = org.role === "owner"
  const ownerCount = members.filter((m) => m.role === "owner").length

  const [inviteOpen, setInviteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [removeMember, setRemoveMember] = useState<{
    userId: string
    name: string
    role: "owner" | "member"
  } | null>(null)
  const [revokeInviteId, setRevokeInviteId] = useState<string | null>(null)

  async function changeRole(
    userId: string,
    role: "owner" | "member",
  ) {
    setPending(true)
    setError(null)
    try {
      await client.organizations.updateMemberRole({
        organizationId: org.id,
        userId,
        role,
      })
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  const inviteButton = isOwner ? (
    <Button size="sm" onClick={() => setInviteOpen(true)}>
      <UserPlusIcon data-icon="inline-start" />
      Invite
    </Button>
  ) : null

  return (
    <>
      <SettingsPage
        title="Members"
        description="People and access for this organization."
        actions={inviteButton}
      >
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const serviceAccount = isLikelyServiceAccount(member)
                  const isSelf = member.userId === session.user.id
                  const isLastOwner =
                    member.role === "owner" && ownerCount <= 1
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {member.name}
                            {isSelf ? (
                              <span className="ml-1.5 font-normal text-muted-foreground">
                                (you)
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isOwner && !isSelf ? (
                          <select
                            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            value={member.role}
                            disabled={pending || isLastOwner}
                            onChange={(e) =>
                              void changeRole(
                                member.userId,
                                e.target.value as "owner" | "member",
                              )
                            }
                          >
                            <option value="member">Member</option>
                            <option value="owner">Owner</option>
                          </select>
                        ) : serviceAccount ? (
                          <span className="text-xs text-muted-foreground">
                            Service account
                          </span>
                        ) : (
                          <RoleBadge role={member.role} />
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {serviceAccount ? "System" : "Active"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {isOwner && !isSelf && !isLastOwner ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Actions for ${member.name}`}
                                />
                              }
                            >
                              <EllipsisIcon className="size-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={pending}
                                onClick={() =>
                                  setRemoveMember({
                                    userId: member.userId,
                                    name: member.name,
                                    role: member.role,
                                  })
                                }
                              >
                                Remove member
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </SettingsPanel>

        {isOwner && invites.length > 0 ? (
          <SettingsPanel
            title="Pending invitations"
            description="Invites expire automatically. Revoke to invalidate the link early."
            flush
          >
            <ul className="divide-y divide-border">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {invite.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pending · Expires{" "}
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <RoleBadge role={invite.role} />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setRevokeInviteId(invite.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </SettingsPanel>
        ) : null}
      </SettingsPage>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={org.id}
      />

      <ConfirmActionDialog
        open={!!removeMember}
        onOpenChange={(open) => {
          if (!open) setRemoveMember(null)
        }}
        title="Remove member"
        description={
          removeMember
            ? removeMember.role === "owner"
              ? `Remove owner ${removeMember.name} from ${org.name}? Transfer ownership first if they are the only owner.`
              : `Remove ${removeMember.name} from ${org.name}? They will lose access immediately.`
            : "Remove this member?"
        }
        confirmLabel="Remove member"
        pending={pending}
        onConfirm={async () => {
          if (!removeMember) return
          setPending(true)
          setError(null)
          try {
            await client.organizations.removeMember({
              organizationId: org.id,
              userId: removeMember.userId,
            })
            await router.invalidate()
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            throw e
          } finally {
            setPending(false)
          }
        }}
      />

      <ConfirmActionDialog
        open={!!revokeInviteId}
        onOpenChange={(open) => {
          if (!open) setRevokeInviteId(null)
        }}
        title="Revoke invite"
        description="Revoke this invite link? Anyone with the link will no longer be able to join."
        confirmLabel="Revoke invite"
        pending={pending}
        onConfirm={async () => {
          if (!revokeInviteId) return
          setPending(true)
          setError(null)
          try {
            await client.organizations.revokeInvite({ id: revokeInviteId })
            await router.invalidate()
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            throw e
          } finally {
            setPending(false)
          }
        }}
      />
    </>
  )
}
