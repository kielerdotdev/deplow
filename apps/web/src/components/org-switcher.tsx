import { useRouter } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  Settings2Icon,
} from "lucide-react"

import { SoftHit } from "@/components/soft-hit"
import { OrgAvatar, RoleBadge } from "@/components/org-ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

export type OrgOption = {
  id: string
  name: string
  slug: string
  role: "owner" | "member"
}

export function applyOrgCookie(setCookie: string) {
  const pair = setCookie.split(";")[0]
  if (pair) document.cookie = pair
}

export function OrgSwitcher({
  organizations,
  active,
  variant = "breadcrumb",
}: {
  organizations: OrgOption[]
  active: OrgOption | null
  variant?: "breadcrumb" | "sidebar"
}) {
  const router = useRouter()

  async function selectOrg(org: OrgOption) {
    if (active?.id === org.id) return
    const result = await client.organizations.setActive({
      organizationId: org.id,
    })
    applyOrgCookie(result.setCookie)
    await router.invalidate()
    await router.navigate({ to: "/" })
  }

  const menu = (
    <DropdownMenuContent
      className="min-w-64 p-1.5"
      side="bottom"
      align="start"
      sideOffset={6}
    >
      <DropdownMenuGroup>
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Switch organization
        </DropdownMenuLabel>
        {organizations.map((org) => {
          const selected = active?.id === org.id
          return (
            <DropdownMenuItem
              key={org.id}
              onClick={() => void selectOrg(org)}
              className={cn(
                "gap-2.5 rounded-sm px-2 py-2",
                selected && "bg-accent",
              )}
            >
              <OrgAvatar name={org.name} id={org.id} size="sm" />
              <div className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate font-medium">{org.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {org.slug}
                </span>
              </div>
              <RoleBadge role={org.role} />
              {selected ? (
                <CheckIcon className="size-4 text-primary" />
              ) : (
                <span className="size-4" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          className="gap-2.5 rounded-sm px-2 py-2"
          onClick={() => void router.navigate({ to: "/organization" })}
        >
          <Settings2Icon className="size-4 text-muted-foreground" />
          <span className="flex-1">Organization settings</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  )

  if (variant === "breadcrumb") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="group/h relative flex w-fit cursor-pointer items-center rounded-sm outline-none"
            />
          }
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-1 rounded-sm bg-foreground/[0.08] opacity-0 transition-[inset,opacity] duration-150 ease-out group-hover/h:inset-0 group-hover/h:opacity-100 group-active/h:inset-px group-data-[popup-open]/h:inset-0 group-data-[popup-open]/h:opacity-100"
          />
          <span className="relative z-[2] flex h-8 items-center px-1.5">
            <OrgAvatar
              name={active?.name ?? "Org"}
              id={active?.id}
              size="sm"
              className="size-5 rounded"
            />
            <span className="px-1.5 truncate max-w-[10rem]">
              {active?.name ?? "Organization"}
            </span>
            <ChevronsUpDownIcon className="size-4 text-foreground/40" />
          </span>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    )
  }

  return (
    <SoftHit>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex h-10 w-full items-center gap-2 px-2 outline-none"
            />
          }
        >
          <OrgAvatar
            name={active?.name ?? "Organization"}
            id={active?.id}
            size="md"
          />
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium tracking-tight">
              {active?.name ?? "Select organization"}
            </span>
            <span className="truncate text-xs capitalize text-muted-foreground">
              {active?.role ?? "No organization"}
            </span>
          </div>
          <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    </SoftHit>
  )
}
