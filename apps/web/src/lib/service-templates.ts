/**
 * Starter templates for Add service — prebuilt images that deploy immediately.
 */

export type ImageServiceTemplate = {
  id: string
  kind: "image"
  name: string
  title: string
  description: string
  image: string
  containerPort: number
  type: "web"
  healthCheckPath?: string
}

export type DataServiceTemplate = {
  id: string
  kind: "data"
  name: string
  title: string
  description: string
  type: "postgres" | "redis"
}

export type ServiceTemplate = ImageServiceTemplate | DataServiceTemplate

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    id: "whoami",
    kind: "image",
    name: "whoami",
    title: "Whoami",
    description: "Tiny hello-world that echoes request headers — perfect smoke test.",
    image: "traefik/whoami:latest",
    containerPort: 80,
    type: "web",
    healthCheckPath: "/",
  },
  {
    id: "nginx",
    kind: "image",
    name: "web",
    title: "Nginx",
    description: "Default Nginx welcome page on port 80.",
    image: "nginx:alpine",
    containerPort: 80,
    type: "web",
    healthCheckPath: "/",
  },
  {
    id: "httpbin",
    kind: "image",
    name: "httpbin",
    title: "HTTPBin",
    description: "HTTP request & response playground (kennethreitz/httpbin).",
    image: "kennethreitz/httpbin:latest",
    containerPort: 80,
    type: "web",
    healthCheckPath: "/get",
  },
  {
    id: "postgres",
    kind: "data",
    name: "postgres",
    title: "PostgreSQL",
    description: "Dedicated Postgres 16 for this project.",
    type: "postgres",
  },
  {
    id: "redis",
    kind: "data",
    name: "redis",
    title: "Redis",
    description: "Dedicated Redis 7 for this project.",
    type: "redis",
  },
]

export function getServiceTemplate(id: string): ServiceTemplate | undefined {
  return SERVICE_TEMPLATES.find((t) => t.id === id)
}
