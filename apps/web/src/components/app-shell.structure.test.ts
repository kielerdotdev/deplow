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
    expect(src).toContain('title: "Home"')
    expect(src).toContain('title: "Team"')
    expect(src).toContain('title: "Nodes"')
    expect(src).toContain("System")
    expect(src).toContain("instanceAdmin")
    expect(src).toContain("OrgSwitcher")
    expect(src).toContain("Sign out")
    expect(src).toContain("CommandProvider")
    expect(src).toContain("CommandPalette")
    expect(src).toContain("CommandPaletteTrigger")
    expect(src).not.toContain("ContainerIcon")
  })

  it("command palette is dual-mode Ctrl+P / Ctrl+K", () => {
    const src = readFileSync(
      path.join(root, "components/command-palette.tsx"),
      "utf8",
    )
    expect(src).toContain('openPalette("goto")')
    expect(src).toContain('openPalette("action")')
    expect(src).toContain('key === "p"')
    expect(src).toContain('key === "k"')
    expect(src).toContain("CommandDialog")
    expect(src).toContain("pushRecentCommand")
  })

  it("project detail syncs section to search params", () => {
    const src = readFileSync(
      path.join(root, "routes/projects/$projectId.tsx"),
      "utf8",
    )
    expect(src).toContain("validateSearch")
    expect(src).toContain("parseProjectSection")
    expect(src).toContain("CommandAction")
    expect(src).toContain("ActionDialog")
    expect(src).toContain("EmptyState")
    expect(src).toContain("Add service")
    expect(src).toContain("Data services")
    expect(src).toContain("AddServiceDialog")
    expect(src).toContain("serviceId")
    expect(src).toContain("fromGit")
    expect(src).toContain("ProjectRail")
    expect(src).not.toContain("BackupsPanel")
    expect(src).not.toContain("DatabasePanel")
    expect(src).toContain("/projects/$projectId/services/$serviceId")
  })

  it("service detail is non-nested so it replaces the project page", () => {
    const src = readFileSync(
      path.join(root, "routes/projects/$projectId_/services/$serviceId.tsx"),
      "utf8",
    )
    expect(src).toContain('"/projects/$projectId_/services/$serviceId"')
    expect(src).toContain("useLogStream")
    expect(src).toContain("LogViewer")
    expect(src).not.toContain(">Refresh<")
    const tree = readFileSync(path.join(root, "routeTree.gen.ts"), "utf8")
    expect(tree).toContain(
      "id: '/projects/$projectId_/services/$serviceId'",
    )
    expect(tree).toMatch(
      /ProjectsProjectIdServicesServiceIdRoute[\s\S]*?getParentRoute: \(\) => rootRouteImport/,
    )
  })

  it("add service dialog detects source and creates with deploy", () => {
    const src = readFileSync(
      path.join(root, "components/add-service-dialog.tsx"),
      "utf8",
    )
    expect(src).toContain("RepoSelector")
    expect(src).toContain("analyzeSource")
    expect(src).toContain("createAndDeploy")
    expect(src).toContain("Create and deploy")
    expect(src).toContain("Worker")
    expect(src).toContain("Advanced settings")
    expect(src).toContain("Checking health")
  })

  it("async deploys enqueue through the queue layer", () => {
    const src = readFileSync(path.join(root, "orpc/deployments.ts"), "utf8")
    expect(src).toContain("enqueueDeploy")
    expect(src).toContain('status: "queued"')
    expect(src).toContain("processDeployJob")
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

  it("repo selector is a searchable combobox", () => {
    const src = readFileSync(
      path.join(root, "components/repo-selector.tsx"),
      "utf8",
    )
    expect(src).toContain("listGitRepos")
    expect(src).toContain("listGitBranches")
    expect(src).toContain("Select a repository…")
    expect(src).toContain("Search repositories…")
    expect(src).toContain("Personal access token")
    expect(src).toContain("Connect GitHub")
    expect(src).toContain("Connect GitLab")
    expect(src).toContain("Use Git URL or access token")
    expect(src).toContain("startOAuth")
    expect(src).toContain("disconnectProvider")
    expect(src).toContain("sm:basis-[70%]")
    expect(src).toContain("sm:basis-[30%]")
    expect(src).toContain('role="combobox"')
    expect(src).not.toContain("Advanced source options")
    expect(src).not.toContain(">Load<")
  })

  it("project rail keeps data admin on services, not project tabs", () => {
    const src = readFileSync(
      path.join(root, "components/project-rail.tsx"),
      "utf8",
    )
    expect(src).toContain('id: "settings"')
    expect(src).toContain("Settings2Icon")
    expect(src).not.toContain('id: "database"')
    expect(src).not.toContain('id: "backups"')
    expect(src).not.toContain('id: "git"')
  })

  it("home is an account overview with projects card", () => {
    const src = readFileSync(path.join(root, "routes/index.tsx"), "utf8")
    expect(src).toContain("New project")
    expect(src).toContain("ActionDialog")
    expect(src).toContain("DashboardCard")
    expect(src).toContain("accountHome")
    expect(src).not.toContain("gitRepoUrl")
    expect(src).not.toContain("spawnBuildServer")
    expect(src).not.toContain("Checkbox")
    expect(src).not.toContain("StatTile")
    expect(src).toContain("publicUrl")
  })

  it("nodes use empty state and add-node dialog", () => {
    const src = readFileSync(path.join(root, "routes/nodes.tsx"), "utf8")
    expect(src).toContain("ActionDialog")
    expect(src).toContain("EmptyState")
    expect(src).toContain("ensureLocal")
    expect(src).not.toContain("Hello")
  })

  it("domains page edits platform ingress settings", () => {
    const src = readFileSync(path.join(root, "routes/domains.tsx"), "utf8")
    expect(src).toContain("ingressUpdate")
    expect(src).toContain("base-domain")
    expect(src).toContain("Auto-assign subdomains")
  })

  it("app shell nav includes Team, Settings, and System gates", () => {
    const src = readFileSync(path.join(root, "components/app-shell.tsx"), "utf8")
    expect(src).toContain('to: "/organization"')
    expect(src).toContain("Team")
    expect(src).toContain('to: "/domains"')
    expect(src).toContain("Domains")
    expect(src).toContain('to: "/notifications"')
    expect(src).toContain("Notifications")
    expect(src).toContain('to: "/settings"')
    expect(src).toContain("Settings")
    expect(src).toContain("instanceAdmin")
  })

  it("shell content uses shared content enter animation", () => {
    const shell = readFileSync(path.join(root, "components/app-shell.tsx"), "utf8")
    const css = readFileSync(path.join(root, "styles.css"), "utf8")
    expect(shell).toContain("animate-content-in")
    expect(css).toContain("animate-content-in")
    expect(css).toContain("prefers-reduced-motion")
    expect(css).toContain("--ease-out-ui")
  })

  it("command palette skips dialog open animation", () => {
    const command = readFileSync(path.join(root, "components/ui/command.tsx"), "utf8")
    expect(command).toContain("animated={false}")
  })

  it("empty states compose shadcn Empty", () => {
    const emptyState = readFileSync(path.join(root, "components/empty-state.tsx"), "utf8")
    expect(emptyState).toContain('from "@/components/ui/empty"')
    expect(emptyState).toContain("EmptyMedia")
  })

  it("domains and nodes loaders require instance admin", () => {
    const domains = readFileSync(path.join(root, "routes/domains.tsx"), "utf8")
    expect(domains).toContain("instanceAdmin")
    expect(domains).toContain('redirect({ to: "/" })')
    const nodes = readFileSync(path.join(root, "routes/nodes.tsx"), "utf8")
    expect(nodes).toContain("instanceAdmin")
    expect(nodes).toContain('redirect({ to: "/" })')
  })

  it("organizations router exposes invite and setActive", () => {
    const src = readFileSync(path.join(root, "orpc/organizations.ts"), "utf8")
    expect(src).toContain("export const invite")
    expect(src).toContain("export const acceptInvite")
    expect(src).toContain("export const setActive")
    const router = readFileSync(path.join(root, "orpc/router.ts"), "utf8")
    expect(router).toContain("organizations:")
    expect(router).toContain("acceptInvite")
  })

  it("login uses Card + Input + Label primitives", () => {
    const src = readFileSync(path.join(root, "routes/login.tsx"), "utf8")
    expect(src).toContain('from "@/components/ui/card"')
    expect(src).toContain('from "@/components/ui/input"')
    expect(src).toContain('from "@/components/ui/label"')
  })

  it("root document defaults to light theme without TanStack Devtools", () => {
    const src = readFileSync(path.join(root, "routes/__root.tsx"), "utf8")
    expect(src).toContain('<html lang="en">')
    expect(src).not.toContain('className="dark"')
    expect(src).not.toContain("TanStackDevtools")
  })
})
