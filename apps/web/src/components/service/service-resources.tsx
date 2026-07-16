import { useState } from "react"
import { CableIcon } from "lucide-react"

import { PageSection } from "@/components/page-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type BindingRow = {
  id: string
  envKey: string
  providerName: string | null
  providerType: string | null
}

export type ProviderOption = {
  id: string
  name: string
  type: string
}

export function ServiceResources({
  bindings,
  providers,
  pending,
  onBind,
  onRemove,
}: {
  bindings: BindingRow[]
  providers: ProviderOption[]
  pending?: boolean
  onBind: (providerId: string, envKey: string) => Promise<void> | void
  onRemove: (id: string) => Promise<void> | void
}) {
  const [connectOpen, setConnectOpen] = useState(false)
  const [bindEnvKey, setBindEnvKey] = useState("DATABASE_URL")
  const [bindProviderId, setBindProviderId] = useState("")

  return (
    <PageSection
      icon={CableIcon}
      title="Resources"
      description="Bound resources inject credentials as environment variables on the next deploy."
    >
      <div className="flex flex-col gap-4">
        <div className="surface-panel divide-y divide-border">
          {bindings.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No resources connected.
            </p>
          ) : (
            bindings.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="font-mono text-sm">{b.envKey}</p>
                  <p className="text-xs text-muted-foreground">
                    → {b.providerName} ({b.providerType})
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void onRemove(b.id)}
                >
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>

        {connectOpen ? (
          <div className="surface-panel grid gap-3 p-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bind-provider">Provider</Label>
              <select
                id="bind-provider"
                name="bind-provider"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={bindProviderId}
                onChange={(e) => {
                  setBindProviderId(e.target.value)
                  const p = providers.find((x) => x.id === e.target.value)
                  if (p?.type === "postgres") setBindEnvKey("DATABASE_URL")
                  if (p?.type === "redis") setBindEnvKey("REDIS_URL")
                }}
              >
                <option value="">Select…</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bind-env-key">Environment variable</Label>
              <Input
                id="bind-env-key"
                name="bind-env-key"
                autoComplete="off"
                spellCheck={false}
                value={bindEnvKey}
                onChange={(e) => setBindEnvKey(e.target.value.toUpperCase())}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                disabled={pending || !bindProviderId}
                onClick={() => void onBind(bindProviderId, bindEnvKey)}
              >
                Connect
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConnectOpen(false)
                  setBindProviderId("")
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => setConnectOpen(true)}
          >
            Connect resource
          </Button>
        )}
      </div>
    </PageSection>
  )
}
