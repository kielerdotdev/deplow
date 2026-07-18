import { Link, useRouterState } from "@tanstack/react-router"

import { SoftHit } from "@/components/soft-hit"
import { cn } from "@/lib/utils"

type NavItem = {
  id: string
  title: string
  to: string
  admin?: boolean
}

type NavGroup = {
  id: string
  title: string
  admin?: boolean
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    id: "organization",
    title: "Organization",
    items: [
      { id: "general", title: "General", to: "/settings" },
      { id: "members", title: "Members", to: "/settings/members" },
      {
        id: "notifications",
        title: "Notifications",
        to: "/settings/notifications",
      },
      {
        id: "integrations",
        title: "Integrations",
        to: "/settings/integrations",
        admin: true,
      },
    ],
  },
  {
    id: "developer",
    title: "Developer",
    items: [
      {
        id: "api",
        title: "API & MCP access",
        to: "/settings/api",
      },
    ],
  },
  {
    id: "platform",
    title: "Platform administration",
    admin: true,
    items: [
      {
        id: "networking",
        title: "Networking & domains",
        to: "/settings/networking",
        admin: true,
      },
      {
        id: "cluster",
        title: "Cluster",
        to: "/settings/cluster",
        admin: true,
      },
      {
        id: "registries",
        title: "Registries",
        to: "/settings/registries",
        admin: true,
      },
    ],
  },
]

function itemIsActive(pathname: string, to: string) {
  if (to === "/settings") {
    return pathname === "/settings" || pathname === "/settings/"
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function SettingsNav({ instanceAdmin }: { instanceAdmin: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.admin || instanceAdmin),
  })).filter(
    (group) => group.items.length > 0 && (!group.admin || instanceAdmin),
  )

  return (
    <nav
      aria-label="Settings"
      className="flex h-full w-full shrink-0 flex-col overflow-y-auto"
    >
      <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <span className="text-[14px] font-medium text-foreground">Settings</span>
      </div>
      <div className="flex flex-col gap-4 px-2 py-3">
        {groups.map((group) => (
          <div key={group.id} className="min-w-0">
            <p className="mb-1 px-2 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
              {group.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = itemIsActive(pathname, item.to)
                return (
                  <li key={item.id} className="min-w-0">
                    <SoftHit active={active} className="w-full">
                      <Link
                        to={item.to}
                        className={cn(
                          "flex h-8 w-full items-center px-2 text-[13px] font-medium",
                          active
                            ? "text-foreground"
                            : "text-muted-foreground group-hover/h:text-foreground",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </SoftHit>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}
