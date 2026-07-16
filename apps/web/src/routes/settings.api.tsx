import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { CheckIcon, CopyIcon, KeyRoundIcon, TerminalIcon } from "lucide-react"

import { CommandAction } from "@/components/command-action"
import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import { EmptyState } from "@/components/empty-state"
import { SettingsPage } from "@/components/page-layout"
import { SettingsField, SettingsSection } from "@/components/settings-section"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { formatRelativeTime } from "@/lib/ui-format"

export const Route = createFileRoute("/settings/api")({
  loader: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: "/login", search: { redirect: undefined } })
    const tokens = await client.mcp.listTokens()
    return { tokens }
  },
  component: ApiAccessPage,
})

function endpointMeta(origin: string): {
  url: string
  isPrivateHttp: boolean
} {
  let isPrivateHttp = false
  try {
    const parsed = new URL(origin)
    isPrivateHttp =
      parsed.protocol === "http:" &&
      (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) ||
        parsed.hostname === "localhost" ||
        parsed.hostname.endsWith(".local"))
  } catch {
    /* ignore */
  }
  return { url: `${origin}/api/mcp`, isPrivateHttp }
}

function ApiAccessPage() {
  const { tokens: initialTokens } = Route.useLoaderData()
  const router = useRouter()
  const [tokens, setTokens] = useState(initialTokens)
  const [name, setName] = useState("")
  const [scope, setScope] = useState<"*" | "read">("*")
  const [expiresInDays, setExpiresInDays] = useState<string>("never")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)

  const origin =
    typeof window !== "undefined" ? window.location.origin : ""
  const { url: mcpUrl, isPrivateHttp } = endpointMeta(origin || "http://localhost")

  async function createToken() {
    setPending(true)
    setError(null)
    setCreatedToken(null)
    try {
      const days =
        expiresInDays === "never" ? null : Number.parseInt(expiresInDays, 10)
      const result = await client.mcp.createToken({
        name,
        scopes: [scope],
        expiresInDays: days,
      })
      setCreatedToken(result.token)
      setName("")
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

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const cursorConfig = `{
  "mcpServers": {
    "hostrig": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer \${env:DEPLOW_MCP_TOKEN}"
      }
    }
  }
}`

  const claudeConfig = `{
  "mcpServers": {
    "hostrig": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer \${DEPLOW_MCP_TOKEN}"
      }
    }
  }
}`

  return (
    <>
      <SettingsPage
        title="API & MCP access"
        description="Connect development tools and manage organization access tokens."
      >
        <CommandAction
          id="settings.focus-mcp"
          label="Focus MCP token name"
          group="Actions"
          mode="action"
          keywords={["mcp", "token", "cursor", "settings", "api"]}
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
                <code className="text-xs">DEPLOW_MCP_TOKEN</code> — do not paste
                it into config files.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full break-all rounded-md bg-muted px-2 py-1 text-xs">
                  {createdToken}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copyText(createdToken, "token")}
                >
                  {copied === "token" ? (
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

        <SettingsSection icon={KeyRoundIcon} title="Endpoint">
          <SettingsField
            label="MCP endpoint"
            description={
              isPrivateHttp
                ? "Private-network endpoint · HTTP — do not expose publicly."
                : "Point MCP clients at this Streamable HTTP URL with a Bearer token."
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-muted px-2 py-1 text-xs">
                {mcpUrl}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyText(mcpUrl, "url")}
              >
                {copied === "url" ? (
                  <CheckIcon className="size-3.5" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
                Copy
              </Button>
            </div>
            {isPrivateHttp ? (
              <Alert className="mt-3">
                <AlertTitle>HTTP on a private address</AlertTitle>
                <AlertDescription>
                  Prefer a canonical HTTPS hostname when available. This endpoint
                  should stay on your private network (Tailscale, VPN, or
                  localhost).
                </AlertDescription>
              </Alert>
            ) : null}
          </SettingsField>
        </SettingsSection>

        <SettingsSection icon={KeyRoundIcon} title="Access tokens">
          <SettingsField
            label="Create token"
            description="Tokens have full account power unless scoped — treat them like passwords."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mcp-token-name">Name</Label>
                <Input
                  id="mcp-token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Cursor – Work laptop"
                  maxLength={64}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-token-scope">Scope</Label>
                <select
                  id="mcp-token-scope"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as "*" | "read")}
                >
                  <option value="*">Full access</option>
                  <option value="read">Read only</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-token-expiry">Expiration</Label>
                <select
                  id="mcp-token-expiry"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                >
                  <option value="never">Never expires</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !name.trim()}
                  onClick={() => void createToken()}
                >
                  Create token
                </Button>
              </div>
            </div>
          </SettingsField>

          <div className="space-y-2">
            <p className="text-sm font-medium">Active tokens</p>
            {tokens.length === 0 ? (
              <EmptyState
                icon={KeyRoundIcon}
                title="No access tokens yet"
                description="Create a token to connect Cursor or other MCP clients."
                size="sm"
              />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {tokens.map((token) => (
                  <li
                    key={token.id}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {token.name}
                      </p>
                      <p
                        className="truncate font-mono text-xs text-muted-foreground"
                        title={token.prefix}
                      >
                        {token.prefix}…
                      </p>
                      <p
                        className="mt-1 text-xs text-muted-foreground"
                        title={`Created ${new Date(token.createdAt).toLocaleString()}${
                          token.lastUsedAt
                            ? ` · Last used ${new Date(token.lastUsedAt).toLocaleString()}`
                            : ""
                        }`}
                      >
                        Created {formatRelativeTime(token.createdAt)}
                        {" · "}
                        {token.lastUsedAt
                          ? `Last used ${formatRelativeTime(token.lastUsedAt)}`
                          : "Never used"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {token.scopeLabel}
                        {" · "}
                        {token.expiresAt
                          ? `Expires ${new Date(token.expiresAt).toLocaleDateString()}`
                          : "Never expires"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setRevokeId(token.id)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SettingsSection>

        <SettingsSection icon={TerminalIcon} title="Client setup">
          <Tabs defaultValue="cursor">
            <TabsList>
              <TabsTrigger value="cursor">Cursor</TabsTrigger>
              <TabsTrigger value="claude">Claude Code</TabsTrigger>
              <TabsTrigger value="generic">Generic MCP</TabsTrigger>
            </TabsList>
            <TabsContent value="cursor" className="space-y-3 pt-3">
              <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                <li>Create a token above</li>
                <li>
                  Set <code className="text-xs">DEPLOW_MCP_TOKEN</code> in your
                  environment
                </li>
                <li>Add this configuration to ~/.cursor/mcp.json</li>
              </ol>
              <div className="relative">
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
                  {cursorConfig}
                </pre>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => void copyText(cursorConfig, "cursor")}
                >
                  {copied === "cursor" ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                  Copy configuration
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="claude" className="space-y-3 pt-3">
              <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                <li>Create a token above</li>
                <li>
                  Export <code className="text-xs">DEPLOW_MCP_TOKEN</code>
                </li>
                <li>Add this to your Claude Code MCP config</li>
              </ol>
              <div className="relative">
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
                  {claudeConfig}
                </pre>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => void copyText(claudeConfig, "claude")}
                >
                  {copied === "claude" ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                  Copy configuration
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="generic" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">
                Any Streamable HTTP MCP client can connect with:
              </p>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                <li>
                  URL: <code className="text-xs">{mcpUrl}</code>
                </li>
                <li>
                  Header:{" "}
                  <code className="text-xs">
                    Authorization: Bearer $DEPLOW_MCP_TOKEN
                  </code>
                </li>
              </ul>
            </TabsContent>
          </Tabs>
        </SettingsSection>
      </SettingsPage>

      <ConfirmActionDialog
        open={!!revokeId}
        onOpenChange={(open) => {
          if (!open) setRevokeId(null)
        }}
        title="Revoke access token"
        description={
          revokeId
            ? `Revoke “${tokens.find((t) => t.id === revokeId)?.name ?? "this token"}”? Connected MCP clients will stop working until you create a new token.`
            : "Revoke this token?"
        }
        confirmLabel="Revoke token"
        pending={pending}
        onConfirm={async () => {
          if (!revokeId) return
          await revokeToken(revokeId)
          setRevokeId(null)
        }}
      />
    </>
  )
}
