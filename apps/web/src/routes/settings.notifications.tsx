import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"

import { PageContent, PageHeader, SettingsPanel } from "@/components/page-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

type WebhookSettings = {
  enabled: boolean
  url: string
  onFailure: boolean
  onSuccess: boolean
  hasSecret: boolean
}

export const Route = createFileRoute("/settings/notifications")({
  loader: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login", search: { redirect: undefined } })
    const shell = await loadShellContext()
    if (!shell.instanceAdmin) throw redirect({ to: "/" })
    const webhook = await client.platform.operatorWebhookGet()
    return { session, shell, webhook }
  },
  component: NotificationsPage,
})

function NotificationsForm({ webhook }: { webhook: WebhookSettings }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(webhook.enabled)
  const [url, setUrl] = useState(webhook.url)
  const [onFailure, setOnFailure] = useState(webhook.onFailure)
  const [onSuccess, setOnSuccess] = useState(webhook.onSuccess)
  const [secret, setSecret] = useState("")
  const [clearSecret, setClearSecret] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save() {
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      await client.platform.operatorWebhookUpdate({
        enabled,
        url,
        onFailure,
        onSuccess,
        secret: clearSecret
          ? null
          : secret.trim().length > 0
            ? secret.trim()
            : undefined,
      })
      setSecret("")
      setClearSecret(false)
      setSaved(true)
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <SettingsPanel
      title="Operator webhook"
      description="One HTTPS endpoint for deploy and provision failures (optional success). Not a Slack/Discord hub — POST JSON only."
      footer={
        <>
          <Button size="sm" disabled={pending} onClick={() => void save()}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {saved ? (
            <span className="text-xs text-muted-foreground">Saved</span>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Save failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={enabled}
              onCheckedChange={(v) => setEnabled(v === true)}
            />
            Enable webhook
          </label>

          <div className="space-y-2">
            <Label htmlFor="operator-webhook-url">HTTPS URL</Label>
            <Input
              id="operator-webhook-url"
              className="font-mono text-sm"
              placeholder="https://hooks.example.com/deplow"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={onFailure}
                onCheckedChange={(v) => setOnFailure(v === true)}
              />
              On failure
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={onSuccess}
                onCheckedChange={(v) => setOnSuccess(v === true)}
              />
              On success
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="operator-webhook-secret">
              Signing secret{" "}
              {webhook.hasSecret ? (
                <span className="text-muted-foreground">(set)</span>
              ) : (
                <span className="text-muted-foreground">(optional)</span>
              )}
            </Label>
            <Input
              id="operator-webhook-secret"
              type="password"
              className="font-mono text-sm"
              placeholder={
                webhook.hasSecret ? "Leave blank to keep" : "Optional HMAC secret"
              }
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="new-password"
              disabled={clearSecret}
            />
            {webhook.hasSecret ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={clearSecret}
                  onCheckedChange={(v) => setClearSecret(v === true)}
                />
                Clear stored secret
              </label>
            ) : null}
          <p className="text-xs text-muted-foreground">
            When set, requests include{" "}
            <code className="font-mono">X-Deplow-Signature</code> (sha256
            HMAC).
          </p>
        </div>
      </div>
    </SettingsPanel>
  )
}

function NotificationsPage() {
  const { webhook } = Route.useLoaderData()

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Thin failure webhook for operators"
      />
      <PageContent width="narrow">
        <NotificationsForm
          key={`${webhook.enabled}:${webhook.url}:${webhook.hasSecret}`}
          webhook={webhook}
        />
      </PageContent>
    </>
  )
}
