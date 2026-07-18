import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Structural guarantees for the shadcn dashboard shell + project segments.
 * Drives the shipped source files (not a reimplementation).
 */
describe("UI shell structure", () => {
  const root = path.resolve(import.meta.dirname, "..")

  it("app-shell uses Atlasflow header tabbar for Deploy nav", () => {
    const src = readFileSync(
      path.join(root, "components/app-shell.tsx"),
      "utf8",
    )
    expect(src).toContain("app-shell")
    expect(src).toContain("app-shell-panel")
    expect(src).toContain("SoftHit")
    expect(src).toContain("NavTab")
    expect(src).toContain("buildDeployNav")
    expect(src).toContain("ProjectSwitcher")
    expect(src).toContain('title: "Overview"')
    expect(src).toContain('title: "Deployments"')
    expect(src).toContain('title: "Secrets"')
    expect(src).not.toContain('title: "Home"')
    expect(src).not.toContain('title: "Team"')
    expect(src).not.toContain("Platform")
    expect(src).toContain("OrgSwitcher")
    expect(src).toContain("Sign out")
    expect(src).toContain("CommandProvider")
    expect(src).toContain("CommandPalette")
    expect(src).toContain("CommandPaletteTrigger")
    expect(src).toContain("Open Deploy")
    expect(src).toContain("Open Observe")
    expect(src).toContain("observeHome")
    expect(src).toContain("ProjectSwitcher")
    expect(src).toContain("pickObserveNavSearch")
    expect(src).toContain("observeSearch")
    expect(src).toContain("Monitor")
    expect(src).toContain("Investigate")
    expect(src).toContain("Changes")
    expect(src).toContain('variant="breadcrumb"')
    expect(src).toContain("observeNav")
    expect(src).toContain("navItems")
    expect(src).not.toContain("<aside")
    expect(src).not.toContain("SidebarProvider")
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
    expect(src).toContain("pickObserveNavSearch")
    expect(src).toContain("Search projects, traces, issues")
  })

  it("project layout nests overview/deployments/secrets/settings", () => {
    const layout = readFileSync(
      path.join(root, "routes/projects/$projectId.tsx"),
      "utf8",
    )
    const overview = readFileSync(
      path.join(root, "routes/projects/$projectId.index.tsx"),
      "utf8",
    )
    expect(layout).toContain("Outlet")
    expect(layout).toContain("AddServiceDialog")
    expect(layout).toContain("CommandAction")
    expect(layout).toContain("AppShell")
    expect(layout).toContain("ProjectLayout")
    expect(layout).not.toContain("Hello")
    expect(layout).not.toContain("RouteComponent")
    expect(layout).not.toContain("ProjectRail")
    expect(layout).not.toContain("validateSearch")
    expect(overview).toContain("ProjectTopology")
    expect(overview).toContain("onAddResource")
    expect(overview).toContain("resource")
    expect(overview).not.toContain("Add Postgres")
    expect(overview).toContain("/projects/$projectId/services/$serviceId")
    expect(overview).not.toContain("BackupsPanel")
    expect(overview).not.toContain("DatabasePanel")
    const topology = readFileSync(
      path.join(root, "components/project-topology.tsx"),
      "utf8",
    )
    expect(topology).toContain("No resources yet")
    expect(topology).toContain("Add resource")
    expect(topology).toContain("Services")
    expect(topology).toContain("Resources")
    expect(topology).not.toContain("topology-board")
    const styles = readFileSync(path.join(root, "styles.css"), "utf8")
    expect(styles).toContain(".page-container")
    expect(styles).not.toContain(".topology-board")
    const tree = readFileSync(path.join(root, "routeTree.gen.ts"), "utf8")
    expect(tree).toContain("id: '/projects/$projectId/deployments'")
    expect(tree).toContain("id: '/projects/$projectId/secrets'")
    expect(tree).toContain("id: '/projects/$projectId/settings'")
  })

  it("service detail is non-nested so it replaces the project page", () => {
    const src = readFileSync(
      path.join(root, "routes/projects/$projectId_/services/$serviceId.tsx"),
      "utf8",
    )
    expect(src).toContain('"/projects/$projectId_/services/$serviceId"')
    expect(src).toContain("ServiceHeader")
    expect(src).toContain("ServiceOverview")
    expect(src).toContain("ServiceSettings")
    expect(src).not.toContain('id: "logs"')
    expect(src).not.toContain('id: "connections"')
    expect(src).not.toContain(">Refresh<")
    const detail = readFileSync(
      path.join(
        root,
        "routes/projects/$projectId_/services/$serviceId_.deployments.$deploymentId.tsx",
      ),
      "utf8",
    )
    expect(detail).toContain("DeploymentLogsPanel")
    expect(detail).toContain("DeploymentDetailNav")
    expect(detail).not.toContain("ServiceNav")
    const logsPanel = readFileSync(
      path.join(root, "components/service/deployment-detail-panels.tsx"),
      "utf8",
    )
    expect(logsPanel).toContain("useLogStream")
    const logViewer = readFileSync(
      path.join(root, "components/log-viewer.tsx"),
      "utf8",
    )
    expect(logViewer).toContain("Following logs")
    expect(logViewer).not.toContain(">Live<")
    const tree = readFileSync(path.join(root, "routeTree.gen.ts"), "utf8")
    expect(tree).toContain(
      "id: '/projects/$projectId_/services/$serviceId'",
    )
    expect(tree).toContain(
      "id: '/projects/$projectId_/services/$serviceId_/deployments/$deploymentId'",
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

  it("async deploys are exposed through the deployments router", () => {
    const src = readFileSync(path.join(root, "orpc/deployments.ts"), "utf8")
    expect(src).toContain("export const")
    expect(src.length).toBeGreaterThan(100)
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
    expect(src).not.toContain('id: "logs"')
  })

  it("home is an account overview with dense project rows", () => {
    const src = readFileSync(path.join(root, "routes/index.tsx"), "utf8")
    expect(src).toContain("New project")
    expect(src).toContain("EmptyState")
    expect(src).toContain("ActionDialog")
    expect(src).toContain("PanelActionButton")
    expect(src).toContain("PageHeader")
    expect(src).toContain("PageContent")
    expect(src).toContain('width="flush"')
    expect(src).toContain("accountHome")
    expect(src).not.toContain("gitRepoUrl")
    expect(src).not.toContain("spawnBuildServer")
    expect(src).not.toContain("Checkbox")
    expect(src).not.toContain("StatTile")
    expect(src).not.toContain("panelTab")
    expect(src).not.toContain("panel-tab")
    expect(src).toContain("publicUrl")
    expect(src).toContain("Recent")
  })

  it("legacy /nodes path redirects to cluster", () => {
    const src = readFileSync(path.join(root, "routes/nodes.tsx"), "utf8")
    expect(src).toContain("redirect")
    expect(src).toContain("/settings/cluster")
  })

  it("agent deploy surface is gone", () => {
    expect(existsSync(path.join(root, "lib/agent"))).toBe(false)
    expect(existsSync(path.join(root, "orpc/nodes.ts"))).toBe(false)
    expect(existsSync(path.join(root, "routes/api/agent.$.ts"))).toBe(false)
    expect(existsSync(path.join(root, "routes/hostrig-agent.ts"))).toBe(false)
    const router = readFileSync(path.join(root, "orpc/router.ts"), "utf8")
    expect(router).not.toContain('nodes:')
    expect(router).toContain("cluster:")
  })

  it("networking page edits platform ingress settings", () => {
    const src = readFileSync(
      path.join(root, "routes/settings.networking.tsx"),
      "utf8",
    )
    expect(src).toContain("ingressUpdate")
    expect(src).toContain("base-domain")
    expect(src).toContain("Automatically assign subdomains")
    expect(src).toContain("Networking & domains")
  })

  it("settings hub hosts grouped organization and platform surfaces", () => {
    const nav = readFileSync(
      path.join(root, "components/settings/settings-nav.tsx"),
      "utf8",
    )
    expect(nav).toContain('to: "/settings"')
    expect(nav).toContain('to: "/settings/members"')
    expect(nav).toContain('to: "/settings/api"')
    expect(nav).toContain('to: "/settings/networking"')
    expect(nav).toContain('to: "/settings/notifications"')
    expect(nav).toContain('to: "/settings/cluster"')
    expect(nav).toContain('to: "/settings/registries"')
    expect(nav).toContain("Platform administration")
    expect(nav).toContain("instanceAdmin")
    const shell = readFileSync(path.join(root, "components/app-shell.tsx"), "utf8")
    expect(shell).toContain('to="/settings"')
    expect(shell).toContain("Settings")
    const layout = readFileSync(path.join(root, "routes/settings.tsx"), "utf8")
    expect(layout).toContain("SettingsShell")
    expect(layout).toContain("SettingsNav")
  })

  it("platform pages use shared page layout primitives", () => {
    for (const file of [
      "routes/settings.integrations.tsx",
      "routes/settings.networking.tsx",
      "routes/settings.notifications.tsx",
      "routes/settings.cluster.tsx",
      "routes/settings.index.tsx",
      "routes/settings.members.tsx",
      "routes/settings.api.tsx",
    ]) {
      const src = readFileSync(path.join(root, file), "utf8")
      expect(src).toContain("SettingsPage")
    }
    const layoutPrimitives = readFileSync(
      path.join(root, "components/page-layout.tsx"),
      "utf8",
    )
    expect(layoutPrimitives).toContain("export function SettingsPage")
    expect(layoutPrimitives).toContain("PanelActionButton")
    expect(layoutPrimitives).toContain("h-12")
    expect(layoutPrimitives).toContain("border-b border-border")
    const networking = readFileSync(
      path.join(root, "routes/settings.networking.tsx"),
      "utf8",
    )
    expect(networking).toContain("SettingsPanel")
    const members = readFileSync(
      path.join(root, "routes/settings.members.tsx"),
      "utf8",
    )
    expect(members).toContain("SettingsPanel")
    expect(members).toContain('title="Members"')
    expect(members).not.toContain("OrgAvatar")
    const general = readFileSync(
      path.join(root, "routes/settings.index.tsx"),
      "utf8",
    )
    expect(general).toContain('title="General"')
    expect(general).toContain("organizations.update")
    expect(general).not.toContain("mcp.createToken")
    const api = readFileSync(path.join(root, "routes/settings.api.tsx"), "utf8")
    expect(api).toContain("API & MCP access")
    expect(api).toContain("mcp.createToken")
    const settings = readFileSync(
      path.join(root, "components/settings-section.tsx"),
      "utf8",
    )
    expect(settings).toContain("SettingsPanel")
  })

  it("app shell content uses nested panel chrome", () => {
    const shell = readFileSync(path.join(root, "components/app-shell.tsx"), "utf8")
    const css = readFileSync(path.join(root, "styles.css"), "utf8")
    expect(shell).toContain("app-shell-panel")
    expect(shell).toContain("app-shell-frame")
    expect(shell).toContain("animate-content-in")
    expect(shell).toContain("data-ui-mode")
    expect(css).toContain(".app-shell-frame")
    expect(css).toContain("max-w-7xl")
    // Page scroll is owned by panel-scroll; frame must grow with content
    // (no flex-1 + min-h-0 trap that clips long pages).
    expect(css).toContain("overflow-y-auto")
    expect(css).toMatch(/\.app-shell-panel-scroll[\s\S]*?overflow-y-auto/)
    expect(css).not.toMatch(
      /\.app-shell-frame\s*\{[^}]*\bflex-1\b[^}]*min-h-0/,
    )
  })

  it("shell content uses shared content enter animation", () => {
    const shell = readFileSync(path.join(root, "components/app-shell.tsx"), "utf8")
    const css = readFileSync(path.join(root, "styles.css"), "utf8")
    expect(shell).toContain("animate-content-in")
    expect(css).toContain("animate-content-in")
    expect(css).toContain("prefers-reduced-motion")
    expect(css).toContain("--ease-out-ui")
  })

  it("router exposes default pending UI and root shows nav progress", () => {
    const router = readFileSync(path.join(root, "router.tsx"), "utf8")
    expect(router).toContain("defaultPendingComponent")
    expect(router).toContain("RoutePending")
    expect(router).toContain("defaultPendingMs")
    expect(router).toContain("defaultErrorComponent")
    const rootRoute = readFileSync(path.join(root, "routes/__root.tsx"), "utf8")
    expect(rootRoute).toContain("NavigationProgress")
    expect(rootRoute).toContain("NotFoundPage")
    const css = readFileSync(path.join(root, "styles.css"), "utf8")
    expect(css).toContain("animate-nav-progress")
  })

  it("gates Observe mode entry on observeEnabled", () => {
    const shell = readFileSync(path.join(root, "components/app-shell.tsx"), "utf8")
    expect(shell).toContain("observeEnabled")
    expect(shell).not.toContain("_observeEnabled")
    expect(shell).toContain("Observe is not enabled")
    expect(shell).toContain("Open Observe")
  })

  it("command palette skips dialog open animation", () => {
    const command = readFileSync(path.join(root, "components/ui/command.tsx"), "utf8")
    expect(command).toContain("animated={false}")
  })

  it("empty states compose shadcn Empty", () => {
    const emptyState = readFileSync(path.join(root, "components/empty-state.tsx"), "utf8")
    expect(emptyState).toContain('from "@/components/ui/empty"')
    expect(emptyState).toContain("EmptyMedia")
    expect(emptyState).toContain("EmptyStateStep")
    expect(emptyState).toContain('variant?: "default" | "compact"')
    expect(emptyState).toContain("surface-inset")
  })

  it("networking and cluster loaders require instance admin", () => {
    const networking = readFileSync(
      path.join(root, "routes/settings.networking.tsx"),
      "utf8",
    )
    expect(networking).toContain("instanceAdmin")
    expect(networking).toContain('redirect({ to: "/" })')
    const cluster = readFileSync(
      path.join(root, "routes/settings.cluster.tsx"),
      "utf8",
    )
    expect(cluster).toContain("instanceAdmin")
    expect(cluster).toContain('redirect({ to: "/" })')
  })

  it("legacy platform URLs redirect into settings", () => {
    for (const [file, dest] of [
      ["routes/organization.tsx", "/settings/members"],
      ["routes/integrations.tsx", "/settings/integrations"],
      ["routes/domains.tsx", "/settings/networking"],
      ["routes/notifications.tsx", "/settings/notifications"],
      ["routes/nodes.tsx", "/settings/cluster"],
      ["routes/settings.team.tsx", "/settings/members"],
      ["routes/settings.domains.tsx", "/settings/networking"],
    ] as const) {
      const src = readFileSync(path.join(root, file), "utf8")
      expect(src).toContain("redirect")
      expect(src).toContain(dest)
    }
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

  it("login uses Atlasflow shell form with auth client", () => {
    const src = readFileSync(path.join(root, "routes/login.tsx"), "utf8")
    expect(src).toContain('createFileRoute("/login")')
    expect(src).toContain("authClient.signIn.email")
    expect(src).toContain("SoftHit")
    expect(src).toContain('from "@/components/ui/input"')
    expect(src).toContain('from "@/components/ui/label"')
    expect(src).not.toContain('Hello "/login"')
  })

  it("root document boots theme without TanStack Devtools", () => {
    const src = readFileSync(path.join(root, "routes/__root.tsx"), "utf8")
    expect(src).toContain("THEME_BOOT_SCRIPT")
    expect(src).toContain("suppressHydrationWarning")
    expect(src).not.toContain('className="dark"')
    expect(src).not.toContain("TanStackDevtools")
  })

  it("app shell exposes theme toggle", () => {
    const src = readFileSync(
      path.join(root, "components/app-shell.tsx"),
      "utf8",
    )
    expect(src).toContain("ThemeToggle")
  })
})
