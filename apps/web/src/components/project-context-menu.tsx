import { Link } from "@tanstack/react-router"
import {
  ExternalLinkIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"

type ProjectContextMenuProps = {
  project: { id: string; name: string; serviceCount?: number }
  pending?: boolean
  onDelete?: () => void
  triggerClassName?: string
  render?: React.ReactElement
  children: React.ReactNode
}

export function ProjectContextMenu({
  project,
  pending,
  onDelete,
  triggerClassName,
  render,
  children,
}: ProjectContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn("outline-none", triggerClassName)}
        render={render}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          render={
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
            />
          }
        >
          <ExternalLinkIcon />
          Open
        </ContextMenuItem>
        <ContextMenuItem
          render={
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              search={{ section: "settings" }}
            />
          }
        >
          <SettingsIcon />
          Settings
        </ContextMenuItem>
        {onDelete ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              disabled={pending}
              onClick={onDelete}
            >
              <Trash2Icon />
              Destroy project
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}
