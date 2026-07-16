import { useState } from "react"
import { Link } from "@tanstack/react-router"
import {
  LinkIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { PageSection } from "@/components/page-section"
import { ServiceGitPanel } from "@/components/service-git-panel"
import { ServiceResources, type BindingRow, type ProviderOption } from "@/components/service/service-resources"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

export type SettingsSection =
  | "general"
  | "source"
  | "domains"
  | "environment"
  | "resources"
  | "danger"

const APP_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "general", label: "General" },
  { id: "source", label: "Source & build" },
  { id: "domains", label: "Domains" },
  { id: "environment", label: "Environment" },
  { id: "resources", label: "Resources" },
  { id: "danger", label: "Danger zone" },
]

const DATA_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "general", label: "General" },
  { id: "danger", label: "Danger zone" },
]

type ServiceSettingsData = {
  id: string
  name: string
  slug: string
  type: string
  containerPort: number
  rootDirectory?: string | null
  buildCommand?: string | null
  startCommand?: string | null
  publicUrl?: string | null
  git: {
    connected: boolean
    provider?: string | null
    repoUrl?: string | null
    repoFullName?: string | null
    branch?: string | null
    webhookUrl?: string | null
    webhookManaged?: boolean
    lastDeliveryAt?: string | null
    lastDeliveryStatus?: string | null
    lastDeliveryError?: string | null
    watchPaths?: string[] | null
  }
  bindings?: BindingRow[]
}

export function ServiceSettings({
  projectId,
  service,
  section,
  onSectionChange,
  providers,
  pending,
  onChanged,
  onBind,
  onRemoveBinding,
  onDestroy,
}: {
  projectId: string
  service: ServiceSettingsData
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  providers: ProviderOption[]
  pending?: boolean
  onChanged: () => Promise<void> | void
  onBind: (providerId: string, envKey: string) => Promise<void> | void
  onRemoveBinding: (id: string) => Promise<void> | void
  onDestroy: () => Promise<void> | void
}) {
  const isApp = service.type === "web" || service.type === "worker"
  const sections = isApp ? APP_SECTIONS : DATA_SECTIONS
  const active = sections.some((s) => s.id === section)
    ? section
    : "general"

  const [port, setPort] = useState(String(service.containerPort))
  const [rootDirectory, setRootDirectory] = useState(
    service.rootDirectory || "",
  )
  const [buildCommand, setBuildCommand] = useState(service.buildCommand || "")
  const [startCommand, setStartCommand] = useState(service.startCommand || "")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [destroyOpen, setDestroyOpen] = useState(false)
  const [destroyConfirm, setDestroyConfirm] = useState("")

  async function saveGeneral() {
    setSaving(true)
    setSaveError(null)
    try {
      const parsedPort = Number(port)
      await client.services.update({
        id: service.id,
        containerPort: Number.isFinite(parsedPort) ? parsedPort : undefined,
        rootDirectory: rootDirectory.trim() || null,
        buildCommand: buildCommand.trim() || null,
        startCommand: startCommand.trim() || null,
      })
      await onChanged()
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="flex shrink-0 flex-row flex-wrap gap-1 lg:w-44 lg:flex-col">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSectionChange(s.id)}
            className={cn(
              "rounded-md px-3 py-2 text-left text-sm",
              active === s.id
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        {active === "general" ? (
          <PageSection
            icon={SettingsIcon}
            title="General"
            description="Service identity and runtime basics."
          >
            <div className="surface-panel flex flex-col gap-4 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="svc-name">Name</Label>
                  <Input id="svc-name" value={service.name} disabled />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="svc-slug">Slug</Label>
                  <Input
                    id="svc-slug"
                    className="font-mono"
                    value={service.slug}
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    Immutable after create.
                  </p>
                </div>
                {isApp ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="svc-port">Container port</Label>
                      <Input
                        id="svc-port"
                        inputMode="numeric"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="svc-root">Root directory</Label>
                      <Input
                        id="svc-root"
                        placeholder="Repository root"
                        value={rootDirectory}
                        onChange={(e) => setRootDirectory(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty for the repository root.
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
              {saveError ? (
                <p className="text-sm text-destructive">{saveError}</p>
              ) : null}
              {isApp ? (
                <Button
                  className="self-start"
                  disabled={saving || pending}
                  onClick={() => void saveGeneral()}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              ) : null}
            </div>
          </PageSection>
        ) : null}

        {active === "source" && isApp ? (
          <div className="flex flex-col gap-4">
            <PageSection
              icon={SettingsIcon}
              title="Source & build"
              description="Repository, branch, webhook, and build commands."
            >
              <ServiceGitPanel
                serviceId={service.id}
                git={service.git}
                onChanged={onChanged}
              />
            </PageSection>
            <div className="surface-panel grid gap-4 p-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="svc-build">Build command</Label>
                <Input
                  id="svc-build"
                  value={buildCommand}
                  onChange={(e) => setBuildCommand(e.target.value)}
                  placeholder="Detected or custom"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="svc-start">Start command</Label>
                <Input
                  id="svc-start"
                  value={startCommand}
                  onChange={(e) => setStartCommand(e.target.value)}
                  placeholder="Detected or custom"
                />
              </div>
              <Button
                className="self-start sm:col-span-2"
                disabled={saving || pending}
                onClick={() => void saveGeneral()}
              >
                {saving ? "Saving…" : "Save build settings"}
              </Button>
            </div>
          </div>
        ) : null}

        {active === "domains" && isApp ? (
          <PageSection
            icon={LinkIcon}
            title="Domains"
            description="Public hostname for this service."
          >
            <div className="surface-panel flex flex-col gap-3 p-4 text-sm">
              {service.publicUrl ? (
                <a
                  href={service.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono hover:underline"
                >
                  {service.publicUrl}
                </a>
              ) : (
                <p className="text-muted-foreground">
                  No public URL yet. Deploy the service, then configure platform
                  domains.
                </p>
              )}
              <Link
                to="/domains"
                className="text-sm underline hover:text-foreground"
              >
                Open Domains settings
              </Link>
            </div>
          </PageSection>
        ) : null}

        {active === "environment" && isApp ? (
          <PageSection
            icon={SettingsIcon}
            title="Environment variables"
            description="Secrets are managed at the project level. Resource bindings also inject credentials."
          >
            <div className="surface-panel flex flex-col gap-3 p-4 text-sm">
              <p className="text-muted-foreground">
                Edit shared secrets for this project, or connect a resource to
                inject DATABASE_URL / REDIS_URL on the next deploy.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/projects/$projectId/secrets"
                  params={{ projectId }}
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted/50"
                >
                  Project secrets
                </Link>
                <Button
                  variant="ghost"
                  onClick={() => onSectionChange("resources")}
                >
                  Resources
                </Button>
              </div>
            </div>
          </PageSection>
        ) : null}

        {active === "resources" && isApp ? (
          <ServiceResources
            bindings={service.bindings ?? []}
            providers={providers}
            pending={pending}
            onBind={onBind}
            onRemove={onRemoveBinding}
          />
        ) : null}

        {active === "danger" ? (
          <PageSection
            icon={Trash2Icon}
            title="Danger zone"
            description="Destroying a service removes its container, deployment history, and bindings. This cannot be undone."
          >
            <Button
              variant="destructive"
              onClick={() => {
                setDestroyConfirm("")
                setDestroyOpen(true)
              }}
            >
              Destroy service
            </Button>
          </PageSection>
        ) : null}
      </div>

      <ActionDialog
        open={destroyOpen}
        onOpenChange={setDestroyOpen}
        title="Destroy service"
        description={`Type ${service.name} to confirm. Containers, deployments, and bindings for this service will be permanently removed.`}
        icon={Trash2Icon}
        footer={
          <Button
            variant="destructive"
            disabled={destroyConfirm !== service.name || pending}
            onClick={() => void onDestroy()}
          >
            Destroy
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="destroy-service-name">Service name</Label>
          <Input
            id="destroy-service-name"
            name="destroy-service-name"
            autoComplete="off"
            spellCheck={false}
            value={destroyConfirm}
            onChange={(e) => setDestroyConfirm(e.target.value)}
            placeholder={service.name}
          />
        </div>
      </ActionDialog>
    </div>
  )
}
