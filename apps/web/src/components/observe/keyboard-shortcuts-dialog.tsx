import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { shortcutsByGroup } from "@/lib/observe/shortcuts"

function formatCombo(combo: string): string {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform)
  return combo
    .replace(/Mod/g, isMac ? "⌘" : "Ctrl")
    .replace(/\+/g, " ")
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const groups = shortcutsByGroup()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts for Observe explorers and the command palette.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group}
              </div>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-muted-foreground">{item.label}</span>
                    <Kbd className="shrink-0 font-mono text-[11px]">
                      {formatCombo(item.combo)}
                    </Kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
