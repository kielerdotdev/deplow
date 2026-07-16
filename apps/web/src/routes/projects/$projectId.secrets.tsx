import { createFileRoute, getRouteApi } from "@tanstack/react-router"

import { PageContent, PageHeader } from "@/components/page-layout"
import { ProjectSecretsPanel } from "@/components/project-secrets-panel"

const projectRoute = getRouteApi("/projects/$projectId")

export const Route = createFileRoute("/projects/$projectId/secrets")({
  component: ProjectSecretsPage,
})

function ProjectSecretsPage() {
  const { project } = projectRoute.useLoaderData()

  return (
    <>
      <PageHeader
        title="Secrets"
        description={`Environment secrets for ${project.name}.`}
      />
      <PageContent width="wide">
        <ProjectSecretsPanel projectId={project.id} />
      </PageContent>
    </>
  )
}
