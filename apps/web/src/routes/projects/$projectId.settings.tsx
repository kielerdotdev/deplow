import { useState } from "react"
import {
  createFileRoute,
  getRouteApi,
  useRouter,
} from "@tanstack/react-router"
import { Trash2Icon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { PageContent, PageHeader, SettingsPanel } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { client } from "@/lib/orpc"
import { useProjectUi } from "@/components/project-ui-context"
const projectRoute = getRouteApi("/projects/$projectId")

export const Route = createFileRoute("/projects/$projectId/settings")({
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { project } = projectRoute.useLoaderData()
  const { setError } = useProjectUi()
  const router = useRouter()
  const [destroyOpen, setDestroyOpen] = useState(false)
  const [confirm, setConfirm] = useState("")
  const [pending, setPending] = useState(false)

  return (
    <>
      <PageHeader
        title="Project settings"
        description={`Configuration for ${project.name}.`}
      />
      <PageContent width="narrow">
        <div className="space-y-4">
          <SettingsPanel title="Project">
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Name:</span>{" "}
                {project.name}
              </p>
              <p>
                <span className="text-muted-foreground">Slug:</span>{" "}
                <span className="font-mono">{project.slug}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Backup interval:</span>{" "}
                {Math.round(project.backupIntervalMs / 3_600_000)}h
              </p>
              <p>
                <span className="text-muted-foreground">Node:</span>{" "}
                {project.nodeId ?? "unassigned"}
              </p>
            </div>
          </SettingsPanel>
          <SettingsPanel
            title="Danger zone"
            description="Destroying a project removes all services, data containers, and backups for this project."
          >
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDestroyOpen(true)}
            >
              Destroy project
            </Button>
          </SettingsPanel>
          <ActionDialog
            open={destroyOpen}
            onOpenChange={setDestroyOpen}
            title="Destroy project"
            description={`Type ${project.name} to confirm.`}
            icon={Trash2Icon}
            footer={
              <Button
                variant="destructive"
                disabled={confirm !== project.name || pending}
                onClick={() =>
                  void (async () => {
                    setPending(true)
                    setError(null)
                    try {
                      await client.projects.destroy({ id: project.id })
                      void router.navigate({ to: "/" })
                    } catch (cause) {
                      setError(
                        cause instanceof Error ? cause.message : String(cause),
                      )
                      setPending(false)
                    }
                  })()
                }
              >
                Destroy
              </Button>
            }
          >
            <div className="space-y-2">
              <Label>Project name</Label>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={project.name}
              />
            </div>
          </ActionDialog>
        </div>
      </PageContent>
    </>
  )
}
