import { useState } from "react"
import {
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { Building2Icon } from "lucide-react"

import { SettingsPage, SettingsPanel } from "@/components/page-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
] as const

export const Route = createFileRoute("/settings/")({
  loader: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: "/login", search: { redirect: undefined } })
    const shell = await loadShellContext()
    if (!shell.activeOrganization) {
      throw redirect({ to: "/" })
    }
    return { session, shell }
  },
  component: GeneralSettingsPage,
})

function GeneralSettingsPage() {
  const { shell } = Route.useLoaderData()
  const router = useRouter()
  const org = shell.activeOrganization!
  const isOwner = org.role === "owner"

  const orgIconUrl =
    "iconUrl" in org && typeof org.iconUrl === "string" ? org.iconUrl : ""
  const orgTimezone =
    "timezone" in org && typeof org.timezone === "string" && org.timezone
      ? org.timezone
      : "UTC"

  const [name, setName] = useState(org.name)
  const [slug, setSlug] = useState(org.slug)
  const [iconUrl, setIconUrl] = useState(orgIconUrl)
  const [timezone, setTimezone] = useState(orgTimezone)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const dirty =
    name !== org.name ||
    slug !== org.slug ||
    iconUrl !== orgIconUrl ||
    timezone !== orgTimezone

  async function saveOrg(event: React.FormEvent) {
    event.preventDefault()
    if (!isOwner || !dirty) return
    setPending(true)
    setError(null)
    try {
      await client.organizations.update({
        id: org.id,
        name,
        slug,
        iconUrl: iconUrl.trim() || null,
        timezone,
      })
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <SettingsPage
      title="General"
      description="Organization identity and defaults."
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsPanel
        icon={Building2Icon}
        title="Organization"
        description={
          isOwner
            ? "Displayed name, slug, icon, and default timezone."
            : "Only owners can change organization settings."
        }
        footer={
          isOwner ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || !dirty}
                onClick={() => {
                  setName(org.name)
                  setSlug(org.slug)
                  setIconUrl(orgIconUrl)
                  setTimezone(orgTimezone)
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="org-general-form"
                size="sm"
                disabled={pending || !dirty}
              >
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : undefined
        }
      >
        <form id="org-general-form" className="grid gap-4" onSubmit={saveOrg}>
          <div className="space-y-2">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isOwner || pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={!isOwner || pending}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Used in identifiers. Prefer lowercase letters, numbers, and
              hyphens.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-icon">Icon URL</Label>
            <Input
              id="org-icon"
              type="url"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              disabled={!isOwner || pending}
              placeholder="https://…"
            />
            <p className="text-xs text-muted-foreground">
              Optional HTTPS image URL for the organization avatar.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-timezone">Default timezone</Label>
            <select
              id="org-timezone"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!isOwner || pending}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
              {!TIMEZONES.includes(timezone as (typeof TIMEZONES)[number]) ? (
                <option value={timezone}>{timezone}</option>
              ) : null}
            </select>
          </div>
        </form>
      </SettingsPanel>
    </SettingsPage>
  )
}
