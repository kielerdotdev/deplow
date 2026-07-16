import { useEffect, useState } from "react"
import { BookmarkIcon, Link2Icon, SaveIcon, Trash2Icon } from "lucide-react"

import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  contextToQueryString,
  parseContext,
  type ObserveContext,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"

type SavedView = {
  id: string
  name: string
  surface: string
  contextJson: string
}

export function SavedViewControls({
  projectId,
  surface,
  context,
  onSave,
  onLoad,
}: {
  projectId?: string
  surface?: string
  context: ObserveContext
  onSave?: (name: string) => void
  onLoad?: (ctx: ObserveContext) => void
}) {
  const [saveOpen, setSaveOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [name, setName] = useState("")
  const [views, setViews] = useState<SavedView[]>([])
  const [loading, setLoading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function copyLink() {
    const qs = contextToQueryString(context)
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`
    await navigator.clipboard.writeText(`${window.location.origin}${url}`)
  }

  async function refreshViews() {
    if (!projectId) return
    setLoading(true)
    try {
      const list = await client.observe.savedViews.list({ projectId })
      setViews(
        list.filter((v) => !surface || v.surface === surface || !v.surface),
      )
    } catch {
      setViews([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (listOpen) void refreshViews()
  }, [listOpen, projectId, surface])

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1 px-2"
        onClick={() => void copyLink()}
        aria-label="Copy deep link"
      >
        <Link2Icon className="size-3.5" />
        Link
      </Button>
      {onSave ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1 px-2"
          onClick={() => {
            setName("")
            setSaveOpen(true)
          }}
          aria-label="Save view"
        >
          <SaveIcon className="size-3.5" />
          Save
        </Button>
      ) : null}
      {projectId && onLoad ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1 px-2"
          onClick={() => setListOpen(true)}
          aria-label="Saved views"
        >
          <BookmarkIcon className="size-3.5" />
          Views
        </Button>
      ) : null}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm" animated={false}>
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Store the current time range and filters to reopen later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="saved-view-name">Name</Label>
            <Input
              id="saved-view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
              autoFocus
              placeholder="My investigation"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSaveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!name.trim()}
              onClick={() => {
                onSave?.(name.trim())
                setSaveOpen(false)
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="sm:max-w-md" animated={false}>
          <DialogHeader>
            <DialogTitle>Saved views</DialogTitle>
            <DialogDescription>
              Restore a previous filter and time context.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : views.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved views yet. Use Save on the context bar.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {views.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(v.contextJson) as Record<
                          string,
                          unknown
                        >
                        onLoad?.(parseContext(parsed))
                        setListOpen(false)
                      } catch {
                        /* ignore bad json */
                      }
                    }}
                  >
                    {v.name}
                  </button>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {v.surface}
                  </span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${v.name}`}
                    onClick={() => setDeleteId(v.id)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setListOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={deleteId != null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        title="Delete saved view"
        description="Remove this saved view? You can save again anytime."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!projectId || !deleteId) return
          await client.observe.savedViews.delete({
            projectId,
            viewId: deleteId,
          })
          setDeleteId(null)
          await refreshViews()
        }}
      />
    </div>
  )
}
