import { useState } from "react"
import {
  createFileRoute,
  getRouteApi,
  useRouter,
} from "@tanstack/react-router"

import { ProjectDeleteDialog } from "@/components/project-delete-dialog"
import { PageContent, PageHeader, SettingsPanel } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { client } from "@/lib/orpc"
import { useProjectUi } from "@/components/project-ui-context"

const projectRoute = getRouteApi("/projects/$projectId")

export const Route = createFileRoute("/projects/$projectId/settings")({
  loader: async () => {
    const nodes = await client.nodes.list()
    return { nodes }
  },
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { project } = projectRoute.useLoaderData()
  const { nodes } = Route.useLoaderData()
  const { setError } = useProjectUi()
  const router = useRouter()
  const [destroyOpen, setDestroyOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [nodePending, setNodePending] = useState(false)
  const [nodeId, setNodeId] = useState(project.nodeId ?? "")

  const selected = nodes.find((n) => n.id === nodeId)

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
            </div>
          </SettingsPanel>

          <SettingsPanel
            title="Deploy node"
            description="Apps and data plane for this project run on one node. Agent nodes must be online."
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="project-node">Node</Label>
                <select
                  id="project-node"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  value={nodeId}
                  onChange={(e) => setNodeId(e.target.value)}
                >
                  <option value="" disabled>
                    Select a node
                  </option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} ({n.provider}
                      {n.status === "offline" ? " · offline" : ""})
                    </option>
                  ))}
                </select>
              </div>
              {selected ? (
                <p className="text-xs text-muted-foreground font-mono">
                  {selected.advertiseHost || selected.host}
                  {selected.agentVersion
                    ? ` · agent v${selected.agentVersion}`
                    : ""}
                </p>
              ) : null}
              <Button
                size="sm"
                disabled={
                  nodePending || !nodeId || nodeId === (project.nodeId ?? "")
                }
                onClick={() => {
                  void (async () => {
                    setNodePending(true)
                    setError(null)
                    try {
                      await client.projects.setNode({
                        id: project.id,
                        nodeId,
                      })
                      await router.invalidate()
                    } catch (cause) {
                      setError(
                        cause instanceof Error ? cause.message : String(cause),
                      )
                    } finally {
                      setNodePending(false)
                    }
                  })()
                }}
              >
                {nodePending ? "Saving…" : "Save node"}
              </Button>
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
