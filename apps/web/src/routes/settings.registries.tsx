import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import {
  ContainerIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react"
import type { ContainerRegistry } from "@deplow/shared"

import { EmptyState } from "@/components/empty-state"
import { SettingsPage, SettingsPanel } from "@/components/page-layout"
import { RegistryFormDialog } from "@/components/settings/registry-form-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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

export const Route = createFileRoute("/settings/registries")({
  loader: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: "/login", search: { redirect: undefined } })
    const shell = await loadShellContext()
    if (!shell.instanceAdmin) throw redirect({ to: "/" })
    const registries = await client.registries.list()
    return { session, shell, registries }
  },
  component: RegistriesPage,
})

function kindLabel(kind: ContainerRegistry["kind"]): string {
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

function RegistriesPage() {
  const { registries: initial } = Route.useLoaderData()
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ContainerRegistry | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function refresh() {
    const list = await client.registries.list()
    setRows(list)
    await router.invalidate()
  }

  function openCreate() {
    setError(null)
    setNotice(null)
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(r: ContainerRegistry) {
    setError(null)
    setNotice(null)
    setEditing(r)
    setDialogOpen(true)
  }

  async function remove(id: string) {
    if (
      !window.confirm(
        "Delete this registry? Pull secrets are not removed from the cluster automatically.",
      )
    ) {
      return
    }
    setPending(true)
    setError(null)
    try {
      await client.registries.delete({ id })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function setDefault(id: string) {
    setPending(true)
    setError(null)
    try {
      await client.registries.setDefaultBuild({ id })
      setNotice("Build default updated. Git deploys will push here.")
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function sync() {
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      const res = await client.registries.syncToCluster()
      setNotice(
        `Synced pull secrets to ${res.namespaces} project namespace(s) (${res.secrets} secret write(s)).` +
          (res.errors.length
            ? ` Issues: ${res.errors.slice(0, 3).join("; ")}`
            : ""),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending || rows.length === 0}
        onClick={() => void sync()}
      >
        {pending ? (
          <Loader2Icon
            className="size-3.5 animate-spin"
            data-icon="inline-start"
          />
        ) : (
          <RefreshCwIcon data-icon="inline-start" />
        )}
        Sync to cluster
      </Button>
      <Button size="sm" disabled={pending} onClick={openCreate}>
        <PlusIcon data-icon="inline-start" />
        Add registry
      </Button>
    </div>
  )

  return (
    <SettingsPage
      title="Registries"
      description="Registries for git builds and private pulls. Credentials become imagePullSecrets in every project namespace on deploy."
      width="wide"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Registry action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice && !error ? (
        <Alert>
          <AlertTitle>Registries</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <div className="surface-panel">
          <EmptyState
            icon={ContainerIcon}
            title="No registries yet"
            description="Add GHCR, Docker Hub, GitLab, or a private Harbor/generic registry so git builds can push and k3s can pull."
            action={
              <Button size="sm" disabled={pending} onClick={openCreate}>
                <PlusIcon data-icon="inline-start" />
                Add registry
              </Button>
            }
          />
        </div>
      ) : (
        <SettingsPanel
          title="Configured registries"
          description="Mark one as the build default for Git deploys. All registries with credentials get pull secrets on the cluster."
          action={toolbar}
          flush
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Image prefix</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Build</TableHead>
                <TableHead className="w-[200px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className={!r.enabled ? "opacity-60" : undefined}
                >
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {kindLabel(r.kind)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.imagePrefix}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.hasPassword ? "Credentials stored" : "No password"}
                  </TableCell>
                  <TableCell>
                    {r.isDefaultBuild ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium">
                        <StarIcon className="size-3.5 fill-current" />
                        Default
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => openEdit(r)}
                      >
                        Edit
                      </Button>
                      {!r.isDefaultBuild && r.enabled ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => void setDefault(r.id)}
                        >
                          Set default
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => void remove(r.id)}
                      >
                        <TrashIcon className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsPanel>
      )}

      <RegistryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        registry={editing}
        defaultAsBuild={rows.length === 0}
        onSaved={async () => {
          setNotice(
            "Registry saved. Pull secrets apply automatically on the next deploy.",
          )
          await refresh()
        }}
      />
    </SettingsPage>
  )
}
