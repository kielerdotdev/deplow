import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { CheckIcon, CopyIcon, KeyRoundIcon, Trash2Icon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { CommandAction } from "@/components/command-action"
import { EmptyState } from "@/components/empty-state"
import { PageContent, PageHeader } from "@/components/page-layout"
import { SettingsField, SettingsSection } from "@/components/settings-section"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/settings")({
  loader: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login", search: { redirect: undefined } })
    const [shell, tokens] = await Promise.all([
      loadShellContext(),
      client.mcp.listTokens(),
    ])
    return { session, shell, tokens }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { session, shell, tokens: initialTokens } = Route.useLoaderData()
  const router = useRouter()
  const [tokens, setTokens] = useState(initialTokens)
  const [name, setName] = useState("Cursor")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const mcpUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "/api/mcp"

  async function createToken() {
    setPending(true)
    setError(null)
    setCreatedToken(null)
    try {
      const result = await client.mcp.createToken({ name })
      setCreatedToken(result.token)
      setTokens(await client.mcp.listTokens())
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  async function revokeToken(id: string) {
    setPending(true)
    setError(null)
    try {
      await client.mcp.revokeToken({ id })
      setTokens(await client.mcp.listTokens())
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
    >
      <PageHeader
        title="Settings"
        description="Operator tokens for Cursor and other MCP clients."
      />
      <PageContent width="narrow">
        <CommandAction
          id="settings.focus-mcp"
          label="Focus MCP token name"
          group="Actions"
          mode="action"
          keywords={["mcp", "token", "cursor", "settings"]}
          onSelect={() => {
            document.getElementById("mcp-token-name")?.focus()
          }}
        />
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {createdToken ? (
          <Alert>
            <AlertTitle>Copy your token now</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                This value is shown once. Store it as{" "}
                <code className="text-xs">DEPLOW_MCP_TOKEN</code> for Cursor.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full break-all rounded-md bg-muted px-2 py-1 text-xs">
                  {createdToken}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copyText(createdToken)}
                >
                  {copied ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                  Copy
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        <SettingsSection icon={KeyRoundIcon} title="MCP access">
          <SettingsField
            label="Endpoint"
            description="Point Cursor (or any MCP client) at this Streamable HTTP URL with a Bearer token."
          >
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-muted px-2 py-1 text-xs">{mcpUrl}</code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyText(mcpUrl)}
              >
                {copied ? (
                  <CheckIcon className="size-3.5" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
                Copy
              </Button>
            </div>
          </SettingsField>

          <SettingsField
            label="Create token"
            description="Tokens have full account power — treat them like passwords."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="mcp-token-name">Name</Label>
                <Input
                  id="mcp-token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Cursor"
                  maxLength={64}
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={pending || !name.trim()}
                onClick={() => void createToken()}
              >
                Create token
              </Button>
            </div>
          </SettingsField>

          <div className="space-y-2">
            <p className="text-sm font-medium">Active tokens</p>
            {tokens.length === 0 ? (
              <EmptyState
                icon={KeyRoundIcon}
                title="No MCP tokens yet"
                description="Create a token to connect Cursor to this Deplow instance."
                size="sm"
              />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {tokens.map((token) => (
                  <li
                    key={token.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{token.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {token.prefix}… · created{" "}
                        {new Date(token.createdAt).toLocaleString()}
                        {token.lastUsedAt
                          ? ` · last used ${new Date(token.lastUsedAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => void revokeToken(token.id)}
                    >
                      <Trash2Icon className="size-3.5" />
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <SettingsField
            label="Cursor mcp.json"
            description="Add this to ~/.cursor/mcp.json (use your real URL and env var)."
          >
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
              {`{
  "mcpServers": {
    "deplow": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer \${env:DEPLOW_MCP_TOKEN}"
      }
    }
  }
}`}
            </pre>
          </SettingsField>
        </SettingsSection>
      </PageContent>
    </AppShell>
  )
}
