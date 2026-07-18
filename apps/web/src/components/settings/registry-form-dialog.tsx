import { useEffect, useMemo, useState } from "react"
import { CheckIcon, ContainerIcon, Loader2Icon } from "lucide-react"
import type { ContainerRegistry, RegistryKind } from "@hostrig/shared"

import { ActionDialog } from "@/components/action-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { client } from "@/lib/orpc"
import { kindDefaults } from "@/lib/registries/kinds"

const KINDS: RegistryKind[] = ["ghcr", "dockerhub", "gitlab", "generic"]

function kindLabel(kind: RegistryKind): string {
  switch (kind) {
    case "ghcr":
      return "GHCR"
    case "dockerhub":
      return "Docker Hub"
    case "gitlab":
      return "GitLab"
    default:
      return "Generic"
  }
}

type FormState = {
  id?: string
  name: string
  kind: RegistryKind
  server: string
  imagePrefix: string
  username: string
  password: string
  isDefaultBuild: boolean
  enabled: boolean
}

function emptyForm(kind: RegistryKind = "ghcr"): FormState {
  const d = kindDefaults(kind)
  return {
    name: "",
    kind,
    server: d.server,
    imagePrefix: "",
    username: "",
    password: "",
    isDefaultBuild: false,
    enabled: true,
  }
}

function formFromRow(r: ContainerRegistry): FormState {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    server: r.server,
    imagePrefix: r.imagePrefix,
    username: r.username ?? "",
    password: "",
    isDefaultBuild: r.isDefaultBuild,
    enabled: r.enabled,
  }
}

export function RegistryFormDialog({
  open,
  onOpenChange,
  registry,
  defaultAsBuild = false,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, dialog edits this registry. */
  registry?: ContainerRegistry | null
  /** Prefer build-default when creating the first registry. */
  defaultAsBuild?: boolean
  onSaved?: () => void | Promise<void>
}) {
  const [form, setForm] = useState<FormState>(() => emptyForm())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setPending(false)
    if (registry) {
      setForm(formFromRow(registry))
    } else {
      const next = emptyForm("ghcr")
      next.isDefaultBuild = defaultAsBuild
      setForm(next)
    }
  }, [open, registry, defaultAsBuild])

  const defaults = useMemo(() => kindDefaults(form.kind), [form.kind])
  const serverLocked = form.kind === "ghcr" || form.kind === "dockerhub"
  const editing = Boolean(form.id)

  function onKindChange(kind: RegistryKind) {
    const d = kindDefaults(kind)
    setForm((prev) => ({
      ...prev,
      kind,
      server:
        kind === "generic" || kind === "gitlab"
          ? prev.server || d.server
          : d.server,
    }))
  }

  async function save() {
    setPending(true)
    setError(null)
    try {
      if (form.id) {
        await client.registries.update({
          id: form.id,
          name: form.name.trim(),
          kind: form.kind,
          server: form.server.trim() || undefined,
          imagePrefix: form.imagePrefix.trim(),
          username: form.username.trim() || null,
          password: form.password.trim() ? form.password : undefined,
          isDefaultBuild: form.isDefaultBuild,
          enabled: form.enabled,
        })
      } else {
        await client.registries.create({
          name: form.name.trim(),
          kind: form.kind,
          server: form.server.trim() || undefined,
          imagePrefix: form.imagePrefix.trim(),
          username: form.username.trim() || null,
          password: form.password.trim() || null,
          isDefaultBuild: form.isDefaultBuild,
          enabled: form.enabled,
        })
      }
      await onSaved?.()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  const canSave =
    form.name.trim().length > 0 &&
    form.imagePrefix.trim().length > 0 &&
    (editing || form.password.trim().length > 0 || form.kind === "generic")

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit registry" : "Add registry"}
      description="Passwords are write-only — leave blank when editing to keep the existing secret."
      icon={ContainerIcon}
      size="lg"
      footer={
        <>
          <Button
            disabled={pending || !canSave}
            onClick={() => void save()}
          >
            {pending ? (
              <Loader2Icon className="size-3.5 animate-spin" data-icon="inline-start" />
            ) : (
              <CheckIcon data-icon="inline-start" />
            )}
            {editing ? "Save changes" : "Create registry"}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {error ? (
          <p className="text-sm text-destructive sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="reg-name">Name</Label>
          <Input
            id="reg-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="GHCR production"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-kind">Type</Label>
          <NativeSelect
            id="reg-kind"
            value={form.kind}
            onChange={(e) => onKindChange(e.target.value as RegistryKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-server">Login server</Label>
          <Input
            id="reg-server"
            value={form.server}
            disabled={serverLocked}
            onChange={(e) => setForm({ ...form, server: e.target.value })}
            placeholder={defaults.server || "registry.example.com"}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="reg-prefix">Image prefix</Label>
          <Input
            id="reg-prefix"
            value={form.imagePrefix}
            onChange={(e) => setForm({ ...form, imagePrefix: e.target.value })}
            placeholder={defaults.imagePrefixHint}
          />
          <p className="text-xs text-muted-foreground">
            Builds push to{" "}
            <code className="font-mono">
              {form.imagePrefix || "…"}/{"{project}-{service}:{id}"}
            </code>
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-user">Username</Label>
          <Input
            id="reg-user"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder={defaults.usernameHint}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-pass">Password / token</Label>
          <Input
            id="reg-pass"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={
              editing ? "Leave blank to keep existing" : defaults.passwordHint
            }
            autoComplete="new-password"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefaultBuild}
              onChange={(e) =>
                setForm({ ...form, isDefaultBuild: e.target.checked })
              }
            />
            Use as build default (git deploys push here)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>
      </div>
    </ActionDialog>
  )
}
