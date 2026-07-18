import { useEffect, useState } from "react"
import { useBlocker } from "@tanstack/react-router"
import {
  EyeIcon,
  EyeOffIcon,
  LinkIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import { SettingsHint, SettingsSection } from "@/components/settings-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PROJECT_ENV_SECRET_MASK } from "@/lib/core/project-secrets.service"
import { client } from "@/lib/orpc"

type EnvEntry = { id: string; key: string; value: string }

function rowId() {
  return crypto.randomUUID()
}

function emptyRow(): EnvEntry {
  return { id: rowId(), key: "", value: "" }
}

function toRows(entries: Array<{ key: string; value: string }>): EnvEntry[] {
  return entries.map((e) => ({ id: rowId(), key: e.key, value: e.value }))
}

export function ProjectSecretsPanel({ projectId }: { projectId: string }) {
  const [bindingYaml, setBindingYaml] = useState("")
  const [bindingMasked, setBindingMasked] = useState(true)
  const [bindingLoading, setBindingLoading] = useState(true)

  const [entries, setEntries] = useState<EnvEntry[]>([])
  const [envMasked, setEnvMasked] = useState(true)
  const [envLoading, setEnvLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())

  async function loadBindings(reveal: boolean) {
    setBindingLoading(true)
    try {
      const result = await client.projects.secrets({ id: projectId, reveal })
      setBindingYaml(
        result.secretsYaml ||
          "No binding credentials yet. Add Postgres or Redis to generate connection secrets.",
      )
      setBindingMasked(result.masked)
    } finally {
      setBindingLoading(false)
    }
  }

  async function loadEnv(reveal: boolean) {
    setEnvLoading(true)
    setError(null)
    try {
      const result = await client.projects.envSecrets({
        id: projectId,
        reveal,
      })
      setEntries(
        result.entries.length > 0 ? toRows(result.entries) : [emptyRow()],
      )
      setEnvMasked(result.masked)
      setRevealedKeys(new Set())
      setDirty(false)
    } finally {
      setEnvLoading(false)
    }
  }

  useEffect(() => {
    void loadBindings(false)
    void loadEnv(false)
  }, [projectId])

  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    withResolver: true,
    enableBeforeUnload: false,
  })

  const leaveBlocked = blocker.status === "blocked"

  function updateEntry(index: number, patch: Partial<EnvEntry>) {
    setEntries((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
    setDirty(true)
  }

  function addRow() {
    setEntries((rows) => [...rows, emptyRow()])
    setDirty(true)
  }

  function removeRow(index: number) {
    setEntries((rows) => {
      const next = rows.filter((_, i) => i !== index)
      return next.length > 0 ? next : [emptyRow()]
    })
    setDirty(true)
  }

  function toggleRevealKey(key: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const payload = entries
        .map(({ key, value }) => ({ key: key.trim(), value }))
        .filter(({ key }) => key.length > 0)
      const result = await client.projects.saveEnvSecrets({
        id: projectId,
        entries: payload,
      })
      setEntries(
        result.entries.length > 0 ? toRows(result.entries) : [emptyRow()],
      )
      setEnvMasked(false)
      setRevealedKeys(new Set(result.entries.map((e) => e.key)))
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        icon={LinkIcon}
        title="Binding secrets"
        description="Auto-generated from Postgres, Redis, and storage bindings. Injected on deploy; read-only here."
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={bindingLoading}
            onClick={() => void loadBindings(bindingMasked)}
          >
            {bindingMasked ? "Reveal" : "Mask"}
          </Button>
        }
      >
        <ScrollArea className="h-48 rounded-lg border border-border bg-muted/20">
          <pre className="p-4 font-mono text-xs whitespace-pre-wrap">
            {bindingLoading ? "Loading…" : bindingYaml}
          </pre>
        </ScrollArea>
        <SettingsHint>
          These values are rewritten to Docker network URLs inside containers.
        </SettingsHint>
      </SettingsSection>

      <SettingsSection
        icon={EyeOffIcon}
        title="Environment variables"
        description="Project-wide secrets injected into every service on deploy. Service-level env overrides these."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={envLoading}
              onClick={() => void loadEnv(envMasked)}
            >
              {envMasked ? "Reveal all" : "Mask all"}
            </Button>
            <Button size="sm" disabled={saving || !dirty} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {envLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry, index) => {
                  const maskedValue =
                    envMasked &&
                    entry.value === PROJECT_ENV_SECRET_MASK &&
                    !revealedKeys.has(entry.key)
                  const showReveal =
                    entry.key.length > 0 &&
                    (envMasked || entry.value === PROJECT_ENV_SECRET_MASK)

                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="align-top">
                        <Input
                          value={entry.key}
                          onChange={(e) =>
                            updateEntry(index, { key: e.target.value })
                          }
                          placeholder="API_KEY"
                          className="font-mono text-xs"
                          spellCheck={false}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex items-center gap-1">
                          <Input
                            value={entry.value}
                            onChange={(e) =>
                              updateEntry(index, { value: e.target.value })
                            }
                            placeholder="value"
                            type={maskedValue ? "password" : "text"}
                            className="font-mono text-xs"
                            spellCheck={false}
                          />
                          {showReveal ? (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={
                                revealedKeys.has(entry.key)
                                  ? "Hide value"
                                  : "Reveal value"
                              }
                              onClick={() => {
                                if (
                                  envMasked &&
                                  entry.value === PROJECT_ENV_SECRET_MASK
                                ) {
                                  void loadEnv(true)
                                  return
                                }
                                toggleRevealKey(entry.key)
                              }}
                            >
                              {revealedKeys.has(entry.key) ? (
                                <EyeOffIcon className="size-4" />
                              ) : (
                                <EyeIcon className="size-4" />
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remove secret"
                          onClick={() => removeRow(index)}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <PlusIcon data-icon="inline-start" />
            Add secret
          </Button>
          <SettingsHint>
            Use standard .env keys (letters, numbers, underscores). Redeploy
            services to apply changes.
          </SettingsHint>
        </div>
      </SettingsSection>

      <ConfirmActionDialog
        open={leaveBlocked}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") blocker.reset?.()
        }}
        title="Unsaved secrets"
        description="You have unsaved environment secrets. Leave without saving?"
        confirmLabel="Leave without saving"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          setDirty(false)
          blocker.proceed?.()
        }}
      >
        <p className="text-sm text-muted-foreground">
          Changes to env secrets will be lost if you leave now.
        </p>
      </ConfirmActionDialog>
    </div>
  )
}
