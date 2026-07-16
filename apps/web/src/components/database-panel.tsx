import { useState } from "react"
import {
  CheckIcon,
  CopyIcon,
  DatabaseIcon,
  KeyRoundIcon,
  PlusIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import { DashboardCard, DashboardRow } from "@/components/dashboard-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { client } from "@/lib/orpc"

type DbOverview = Awaited<ReturnType<typeof client.projects.databaseOverview>>

type DatabasePanelProps = {
  projectId: string
  overview: DbOverview
  onRefresh: () => Promise<void>
}

type PendingConfirm =
  | { kind: "rotate-pg"; name: string }
  | { kind: "drop-pg"; name: string }
  | { kind: "rotate-redis"; name: string }
  | { kind: "drop-redis"; name: string }
  | null

export function DatabasePanel({
  projectId,
  overview,
  onRefresh,
}: DatabasePanelProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shownSecret, setShownSecret] = useState<string | null>(null)
  const [createPgOpen, setCreatePgOpen] = useState(false)
  const [createRedisOpen, setCreateRedisOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<PendingConfirm>(null)

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1500)
  }

  async function rotatePg(roleName: string) {
    setPending(true)
    setError(null)
    try {
      const rotated = await client.projects.rotatePostgresRole({
        id: projectId,
        roleName,
      })
      setShownSecret(
        `Role ${rotated.name}\nNew password (copy now): ${rotated.password}`,
      )
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function dropPg(roleName: string) {
    setPending(true)
    setError(null)
    try {
      await client.projects.dropPostgresRole({ id: projectId, roleName })
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function rotateRedis(username: string) {
    setPending(true)
    setError(null)
    try {
      const rotated = await client.projects.rotateRedisUser({
        id: projectId,
        username,
      })
      setShownSecret(
        `User ${rotated.username}\nNew password (copy now): ${rotated.password}`,
      )
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function dropRedis(username: string) {
    setPending(true)
    setError(null)
    try {
      await client.projects.dropRedisUser({ id: projectId, username })
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function exportRedisNs() {
    setPending(true)
    setError(null)
    try {
      const file = await client.projects.exportRedis({ id: projectId })
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `redis-${projectId}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  const confirmCopy = confirm
    ? {
        "rotate-pg": {
          title: `Rotate password for ${confirm.name}?`,
          description:
            "A new password is generated. Copy it from the alert that appears — it won’t be shown again.",
          confirmLabel: "Rotate password",
          destructive: false,
          run: () => rotatePg(confirm.name),
        },
        "drop-pg": {
          title: `Drop role ${confirm.name}?`,
          description:
            "This removes the Postgres role from the project database.",
          confirmLabel: "Drop role",
          destructive: true,
          run: () => dropPg(confirm.name),
        },
        "rotate-redis": {
          title: `Rotate password for ${confirm.name}?`,
          description:
            "A new password is generated. Copy it from the alert that appears — it won’t be shown again.",
          confirmLabel: "Rotate password",
          destructive: false,
          run: () => rotateRedis(confirm.name),
        },
        "drop-redis": {
          title: `Drop Redis user ${confirm.name}?`,
          description:
            "This removes the ACL user from the project Redis namespace.",
          confirmLabel: "Drop user",
          destructive: true,
          run: () => dropRedis(confirm.name),
        },
      }[confirm.kind]
    : null

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Database action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {shownSecret ? (
        <Alert>
          <AlertTitle>Copy credentials now</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap font-mono text-xs">
            {shownSecret}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <DashboardCard title="Postgres">
          {overview.postgres ? (
            <>
              <DashboardRow
                title={overview.postgres.database}
                subtitle={`${overview.postgres.host}:${overview.postgres.port} · dedicated`}
                trailing={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() =>
                      void copy(overview.postgres!.url ?? "", "pg-url")
                    }
                    aria-label="Copy DATABASE_URL"
                  >
                    {copied === "pg-url" ? <CheckIcon /> : <CopyIcon />}
                  </Button>
                }
              />
              <DashboardRow
                title={overview.postgres.user}
                subtitle="App role"
                leading={
                  <KeyRoundIcon className="size-4 text-muted-foreground" />
                }
              />
            </>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Postgres not ready
            </p>
          )}
        </DashboardCard>

        <DashboardCard title="Redis">
          {overview.redis ? (
            <>
              <DashboardRow
                title={overview.redis.namespace ?? "instance"}
                subtitle={`${overview.redis.host}:${overview.redis.port} · dedicated`}
                trailing={
                  overview.redis.url ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() =>
                        void copy(overview.redis!.url!, "redis-url")
                      }
                      aria-label="Copy REDIS_URL"
                    >
                      {copied === "redis-url" ? <CheckIcon /> : <CopyIcon />}
                    </Button>
                  ) : null
                }
              />
            </>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Redis not ready
            </p>
          )}
        </DashboardCard>

        <DashboardCard title="Object storage">
          {overview.storage ? (
            <DashboardRow
              title={overview.storage.bucket}
              subtitle={`${overview.storage.endpoint} · shared`}
            />
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Storage not ready
            </p>
          )}
        </DashboardCard>
      </div>

      {overview.resources?.length ? (
        <DashboardCard title="Capabilities" count={overview.resources.length}>
          {overview.resources.map((resource) => (
            <DashboardRow
              key={resource.id}
              title={resource.kind}
              subtitle={`${resource.source} · ${resource.status}${
                resource.capabilities.backup ? " · backup" : ""
              }${resource.capabilities.pitr ? " · pitr" : ""}${
                resource.capabilities.principals ? " · principals" : ""
              }`}
              leading={
                resource.kind === "postgres" ? (
                  <DatabaseIcon className="size-4 text-muted-foreground" />
                ) : resource.kind === "redis" ? (
                  <WorkflowIcon className="size-4 text-muted-foreground" />
                ) : (
                  <KeyRoundIcon className="size-4 text-muted-foreground" />
                )
              }
            />
          ))}
        </DashboardCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard
          title="Postgres roles"
          count={overview.pgRoles.length}
          onAdd={() => setCreatePgOpen(true)}
        >
          {overview.pgRoles.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No roles</p>
          ) : (
            overview.pgRoles.map((role) => (
              <div
                key={role.name}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <DatabaseIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{role.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {role.isAppRole ? "App role" : "Extra role"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    setConfirm({ kind: "rotate-pg", name: role.name })
                  }
                >
                  Rotate
                </Button>
                {!role.isAppRole ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      setConfirm({ kind: "drop-pg", name: role.name })
                    }
                    aria-label={`Drop ${role.name}`}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </DashboardCard>

        <DashboardCard
          title="Redis users"
          count={overview.redisUsers.length}
          onAdd={() => setCreateRedisOpen(true)}
        >
          <div className="flex gap-2 border-b border-border px-4 py-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void exportRedisNs()}
            >
              Export namespace
            </Button>
          </div>
          {overview.redisUsers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No users</p>
          ) : (
            overview.redisUsers.map((user) => (
              <div
                key={user.username}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <WorkflowIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {user.username}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.isAppUser ? "App user" : "Extra user"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    setConfirm({ kind: "rotate-redis", name: user.username })
                  }
                >
                  Rotate
                </Button>
                {!user.isAppUser ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      setConfirm({ kind: "drop-redis", name: user.username })
                    }
                    aria-label={`Drop ${user.username}`}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </DashboardCard>
      </div>

      <CreatePgRoleDialog
        open={createPgOpen}
        onOpenChange={setCreatePgOpen}
        projectId={projectId}
        onCreated={async (secret) => {
          setShownSecret(secret)
          await onRefresh()
        }}
        onError={setError}
      />

      <CreateRedisUserDialog
        open={createRedisOpen}
        onOpenChange={setCreateRedisOpen}
        projectId={projectId}
        onCreated={async (secret) => {
          setShownSecret(secret)
          await onRefresh()
        }}
        onError={setError}
      />

      <ConfirmActionDialog
        open={confirm != null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={confirmCopy?.title ?? ""}
        description={confirmCopy?.description ?? ""}
        confirmLabel={confirmCopy?.confirmLabel}
        destructive={confirmCopy?.destructive}
        pending={pending}
        onConfirm={async () => {
          if (!confirmCopy) return
          await confirmCopy.run()
        }}
      />
    </div>
  )
}

function CreatePgRoleDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
  onError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onCreated: (secret: string) => Promise<void>
  onError: (message: string | null) => void
}) {
  if (!open) return null
  return (
    <CreatePgRoleDialogBody
      onOpenChange={onOpenChange}
      projectId={projectId}
      onCreated={onCreated}
      onError={onError}
    />
  )
}

function CreatePgRoleDialogBody({
  onOpenChange,
  projectId,
  onCreated,
  onError,
}: {
  onOpenChange: (open: boolean) => void
  projectId: string
  onCreated: (secret: string) => Promise<void>
  onError: (message: string | null) => void
}) {
  const [roleName, setRoleName] = useState("")
  const [rolePreset, setRolePreset] = useState<"readonly" | "readwrite">(
    "readonly",
  )
  const [pending, setPending] = useState(false)

  async function createPgRole(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    onError(null)
    try {
      const created = await client.projects.createPostgresRole({
        id: projectId,
        name: roleName,
        preset: rolePreset,
      })
      onOpenChange(false)
      await onCreated(
        `Role ${created.name}\nPassword (copy now): ${created.password}`,
      )
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title="Create Postgres role"
      description="Extra login for this project database."
      footer={
        <Button
          type="submit"
          form="create-pg-role"
          disabled={pending || !roleName}
        >
          <PlusIcon data-icon="inline-start" />
          Create
        </Button>
      }
    >
      <form
        id="create-pg-role"
        className="space-y-3"
        onSubmit={(e) => void createPgRole(e)}
      >
        <div className="space-y-1.5">
          <Label htmlFor="role-name">Name</Label>
          <Input
            id="role-name"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder="readonly"
            pattern="[a-z][a-z0-9_]*"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={rolePreset === "readonly" ? "default" : "outline"}
            onClick={() => setRolePreset("readonly")}
          >
            Readonly
          </Button>
          <Button
            type="button"
            size="sm"
            variant={rolePreset === "readwrite" ? "default" : "outline"}
            onClick={() => setRolePreset("readwrite")}
          >
            Read/write
          </Button>
        </div>
      </form>
    </ActionDialog>
  )
}

function CreateRedisUserDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
  onError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onCreated: (secret: string) => Promise<void>
  onError: (message: string | null) => void
}) {
  if (!open) return null
  return (
    <CreateRedisUserDialogBody
      onOpenChange={onOpenChange}
      projectId={projectId}
      onCreated={onCreated}
      onError={onError}
    />
  )
}

function CreateRedisUserDialogBody({
  onOpenChange,
  projectId,
  onCreated,
  onError,
}: {
  onOpenChange: (open: boolean) => void
  projectId: string
  onCreated: (secret: string) => Promise<void>
  onError: (message: string | null) => void
}) {
  const [redisName, setRedisName] = useState("")
  const [pending, setPending] = useState(false)

  async function createRedisUser(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    onError(null)
    try {
      const created = await client.projects.createRedisUser({
        id: projectId,
        name: redisName,
      })
      onOpenChange(false)
      await onCreated(
        `User ${created.username}\nPassword (copy now): ${created.password}`,
      )
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title="Create Redis user"
      description="ACL user scoped to this project namespace."
      footer={
        <Button
          type="submit"
          form="create-redis-user"
          disabled={pending || !redisName}
        >
          Create
        </Button>
      }
    >
      <form
        id="create-redis-user"
        className="space-y-3"
        onSubmit={(e) => void createRedisUser(e)}
      >
        <div className="space-y-1.5">
          <Label htmlFor="redis-name">Name</Label>
          <Input
            id="redis-name"
            value={redisName}
            onChange={(e) => setRedisName(e.target.value)}
            placeholder="worker"
            pattern="[a-z][a-z0-9_]*"
          />
        </div>
      </form>
    </ActionDialog>
  )
}
