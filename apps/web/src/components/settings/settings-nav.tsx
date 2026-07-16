import { Link, useRouterState } from "@tanstack/react-router"

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
        id: "operator",
        title: "Operator",
        to: "/settings/operator",
        admin: true,
      },
      {
        id: "nodes",
        title: "Nodes",
        to: "/settings/nodes",
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
      className="flex w-full shrink-0 flex-col gap-5 lg:sticky lg:top-16 lg:w-52"
    >
      <p className="text-xl font-semibold tracking-[-0.035em] text-foreground md:text-[1.375rem]">
        Settings
      </p>
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.id} className="min-w-0">
            <p className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {group.title}
            </p>
            <ul className="flex flex-row flex-wrap gap-0.5 lg:flex-col">
              {group.items.map((item) => {
                const active = itemIsActive(pathname, item.to)
                return (
                  <li key={item.id} className="min-w-0">
                    <Link
                      to={item.to}
                      className={cn(
                        "block rounded-md px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.title}
                    </Link>
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
