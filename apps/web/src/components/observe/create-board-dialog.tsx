import { useEffect, useState } from "react"
import { LayoutDashboardIcon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { client } from "@/lib/orpc"

type BoardTemplate = "blank" | "service-overview"

type CreateBoardDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onCreated: (board: { id: string; name: string }) => void
}

/**
 * Name + template for a new board. Keeps create off the empty detail page.
 */
export function CreateBoardDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: CreateBoardDialogProps) {
  const [name, setName] = useState("Untitled board")
  const [template, setTemplate] = useState<BoardTemplate>("blank")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName("Untitled board")
    setTemplate("blank")
    setPending(false)
    setError(null)
  }, [open])

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Name is required")
      return
    }
    setPending(true)
    setError(null)
    try {
      const { id } = await client.observe.dashboards.create({
        projectId,
        name: trimmed,
        template,
      })
      onOpenChange(false)
      onCreated({ id, name: trimmed })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create board")
    } finally {
      setPending(false)
    }
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New board"
      description="A board is a grid of saved charts with a shared time range."
      icon={LayoutDashboardIcon}
      size="sm"
      footer={
        <div className="flex w-full gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={pending || !name.trim()}
            onClick={() => void submit()}
          >
            {pending ? "Creating…" : "Create board"}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="board-name">Name</Label>
          <Input
            id="board-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Production overview"
            autoFocus
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="board-template">Template</Label>
          <select
            id="board-template"
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value={template}
            disabled={pending}
            onChange={(e) => setTemplate(e.target.value as BoardTemplate)}
          >
            <option value="blank">Blank</option>
            <option value="service-overview">Service overview</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {template === "service-overview"
              ? "Seeds a few starter charts for request rate and errors."
              : "Start empty — add saved charts after create."}
          </p>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </ActionDialog>
  )
}
