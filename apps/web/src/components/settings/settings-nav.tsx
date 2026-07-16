import { Link, useRouterState } from "@tanstack/react-router"
import {
  BellIcon,
  GlobeIcon,
  KeyRoundIcon,
  PlugIcon,
  ServerIcon,
  UsersIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

const ITEMS = [
  { id: "general", title: "General", to: "/settings", icon: KeyRoundIcon },
  { id: "team", title: "Team", to: "/settings/team", icon: UsersIcon },
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
    id: "notifications",
    title: "Notifications",
    to: "/settings/notifications",
    icon: BellIcon,
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
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
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
