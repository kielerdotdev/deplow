import { eq, db, projects, services } from "@deplow/db"

import { ServiceLifecycleError } from "./deploy"

export type CreateServiceInput = {
  projectId: string
  name: string
  type: "web" | "worker" | "postgres" | "redis"
  containerPort?: number
}

export async function createService(input: CreateServiceInput): Promise<{
  serviceId: string
  shouldProvision: boolean
}> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1)
  if (!project) {
    throw new ServiceLifecycleError("Project not found", "NOT_FOUND")
  }

  const existing = await db
    .select()
    .from(services)
    .where(eq(services.projectId, project.id))
  if (existing.some((s) => s.name === input.name)) {
    throw new ServiceLifecycleError("Service name is already used")
  }

  const id = crypto.randomUUID()
  const isData = input.type === "postgres" || input.type === "redis"
  await db.insert(services).values({
    id,
    projectId: project.id,
    name: input.name,
    slug: `${project.slug}-${input.name}`,
    type: input.type,
    containerPort: isData ? 0 : (input.containerPort ?? 80),
    isPrimary:
      input.type === "web" && !existing.some((s) => s.isPrimary),
    status: isData ? "queued" : "stopped",
  })

  return { serviceId: id, shouldProvision: isData }
}
