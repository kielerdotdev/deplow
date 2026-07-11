import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Structural guarantees for the shadcn dashboard shell + project segments.
 * Drives the shipped source files (not a reimplementation).
 */
describe("UI shell structure", () => {
  const root = path.resolve(import.meta.dirname, "..")

  it("app-shell uses shadcn Sidebar and nav destinations", () => {
    const src = readFileSync(
      path.join(root, "components/app-shell.tsx"),
      "utf8",
    )
    expect(src).toContain("SidebarProvider")
    expect(src).toContain("SidebarMenuButton")
    expect(src).toContain('title: "Projects"')
    expect(src).toContain('title: "Nodes"')
    expect(src).toContain("Sign out")
    expect(src).toContain("text-lg font-semibold")
    expect(src).not.toContain("ContainerIcon")
  })

  it("project detail exposes services and linked resources", () => {
    const src = readFileSync(
      path.join(root, "routes/projects/$projectId.tsx"),
      "utf8",
    )
    expect(src).toContain("ActionDialog")
    expect(src).toContain("EmptyState")
    expect(src).toContain("Add service")
    expect(src).toContain("Linked resources")
    expect(src).toContain("Worker")
    expect(src).toContain("serviceId")
    expect(src).toContain("fromGit")
    expect(src).toContain("Project secrets")
    expect(src).toContain("Postgres backups")
  })

  it("async deploys return queued and execute in background", () => {
    const src = readFileSync(path.join(root, "orpc/deployments.ts"), "utf8")
    expect(src).toContain("executeDeploy")
    expect(src).toContain('status: "queued"')
    expect(src).toContain("void executeDeploy")
  })

  it("project settings steals Railway source + networking patterns", () => {
    const src = readFileSync(
      path.join(root, "components/project-settings.tsx"),
      "utf8",
    )
    expect(src).toContain("Source")
    expect(src).toContain("Networking")
    expect(src).toContain("Source Repo")
    expect(src).toContain("Branch connected to production")
    expect(src).toContain("Auto deploys when pushed")
    expect(src).toContain("Public Networking")
    expect(src).toContain("Private Networking")
    expect(src).toContain("Filter settings")
    expect(src).toContain("ConnectionChip")
    expect(src).toContain("SettingsSection")
    expect(src).toContain("RepoSelector")
  })

  it("repo selector is a searchable list not a raw URL field", () => {
    const src = readFileSync(
      path.join(root, "components/repo-selector.tsx"),
      "utf8",
    )
    expect(src).toContain("listGitRepos")
    expect(src).toContain("listGitBranches")
    expect(src).toContain("Search repositories")
    expect(src).toContain("Personal access token")
    expect(src).toContain("Connect GitHub")
    expect(src).toContain("startOAuth")
    expect(src).toContain("Advanced")
  })

  it("project rail exposes Settings instead of bare Git", () => {
    const src = readFileSync(
      path.join(root, "components/project-rail.tsx"),
      "utf8",
    )
    expect(src).toContain('id: "settings"')
    expect(src).toContain("Settings2Icon")
    expect(src).not.toContain('id: "git"')
  })

  it("home create asks only for a project name", () => {
    const src = readFileSync(path.join(root, "routes/index.tsx"), "utf8")
    expect(src).toContain("Create project")
    expect(src).toContain("ActionDialog")
    expect(src).toContain("EmptyState")
    expect(src).not.toContain("gitRepoUrl")
    expect(src).not.toContain("spawnBuildServer")
    expect(src).not.toContain("Checkbox")
    expect(src).toContain("publicUrl")
  })

  it("nodes use empty state and add-node dialog", () => {
    const src = readFileSync(path.join(root, "routes/nodes.tsx"), "utf8")
    expect(src).toContain("ActionDialog")
    expect(src).toContain("EmptyState")
    expect(src).toContain("ensureLocal")
  })

  it("login uses Card + Input + Label primitives", () => {
    const src = readFileSync(path.join(root, "routes/login.tsx"), "utf8")
    expect(src).toContain('from "@/components/ui/card"')
    expect(src).toContain('from "@/components/ui/input"')
    expect(src).toContain('from "@/components/ui/label"')
  })

  it("root document defaults to dark theme without TanStack Devtools", () => {
    const src = readFileSync(path.join(root, "routes/__root.tsx"), "utf8")
    expect(src).toContain('className="dark"')
    expect(src).not.toContain("TanStackDevtools")
  })
})
