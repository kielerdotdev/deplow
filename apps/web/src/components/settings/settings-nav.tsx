import { Link, useRouterState } from "@tanstack/react-router"
import {
  BellIcon,
  GlobeIcon,
  KeyRoundIcon,
  PlugIcon,
  ShieldIcon,
  ServerIcon,
  UsersIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

const ITEMS = [
  { id: "general", title: "General", to: "/settings", icon: KeyRoundIcon },
  { id: "team", title: "Team", to: "/settings/team", icon: UsersIcon },
  {
    id: "notifications",
    title: "Notifications",
    to: "/settings/notifications",
    icon: BellIcon,
  },
  {
    id: "integrations",
    title: "Integrations",
    to: "/settings/integrations",
    icon: PlugIcon,
    admin: true,
  },
  {
    id: "domains",
    title: "Domains",
    to: "/settings/domains",
    icon: GlobeIcon,
    admin: true,
  },
  {
    id: "operator",
    title: "Operator",
    to: "/settings/operator",
    icon: ShieldIcon,
    admin: true,
  },
  {
    id: "nodes",
    title: "Nodes",
    to: "/settings/nodes",
    icon: ServerIcon,
    admin: true,
  },
] as const

export function SettingsNav({ instanceAdmin }: { instanceAdmin: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-border/60 pb-2">
      {ITEMS.filter((item) => !("admin" in item && item.admin) || instanceAdmin).map(
        (item) => {
          const active =
            item.to === "/settings"
              ? pathname === "/settings" || pathname === "/settings/"
              : pathname.startsWith(item.to)
          return (
            <Link
              key={item.id}
              to={item.to}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="size-3.5 opacity-70" />
              {item.title}
            </Link>
          )
        },
      )}
    </nav>
  )
}
