import { useRouter } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  Settings2Icon,
} from "lucide-react"

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
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
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
}: {
  organizations: OrgOption[]
  active: OrgOption | null
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

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="border border-transparent data-[popup-open]:border-sidebar-border data-[popup-open]:bg-sidebar-accent data-[state=open]:border-sidebar-border data-[state=open]:bg-sidebar-accent"
              />
            }
          >
            <OrgAvatar
              name={active?.name ?? "Organization"}
              id={active?.id}
              size="md"
            />
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold tracking-tight">
                {active?.name ?? "Select organization"}
              </span>
              <span className="truncate text-xs capitalize text-muted-foreground">
                {active?.role ?? "No organization"}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-64 p-1.5"
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
                      "gap-2.5 rounded-md px-2 py-2",
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
                className="gap-2.5 rounded-md px-2 py-2"
                onClick={() => void router.navigate({ to: "/organization" })}
              >
                <Settings2Icon className="size-4 text-muted-foreground" />
                <span className="flex-1">Organization settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
