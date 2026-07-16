import { useState } from "react"
import {
  createFileRoute,
  getRouteApi,
  useRouter,
} from "@tanstack/react-router"

import { ProjectDeleteDialog } from "@/components/project-delete-dialog"
import { PageContent, PageHeader, SettingsPanel } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
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
            description="Destroying a project removes all services, data containers, and backups for this project. Available only from settings — not the project header."
          >
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDestroyOpen(true)}
            >
              Destroy project
            </Button>
          </SettingsPanel>
          <ProjectDeleteDialog
            project={{
              id: project.id,
              name: project.name,
              serviceCount: project.services.length,
            }}
            open={destroyOpen}
            onOpenChange={setDestroyOpen}
            pending={pending}
            onConfirm={async () => {
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
            }}
          />
        </div>
      </PageContent>
    </>
  )
}
