import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("Observe UI structure", () => {
  const root = path.resolve(import.meta.dirname, "../..")

  it("route tree includes observe surfaces + ingest endpoints", () => {
    const tree = readFileSync(path.join(root, "routeTree.gen.ts"), "utf8")
    expect(tree).toContain("'/observe/'")
    expect(tree).toContain("'/observe/projects/$projectId'")
    expect(tree).toContain("'/observe/projects/$projectId/'")
    expect(tree).toContain("'/observe/projects/$projectId/services'")
    expect(tree).toContain("'/observe/projects/$projectId/explore'")
    expect(tree).toContain("'/observe/projects/$projectId/traces'")
    expect(tree).toContain("'/observe/projects/$projectId/logs'")
    expect(tree).toContain("'/observe/projects/$projectId/dashboards'")
    expect(tree).toContain("'/observe/projects/$projectId/insights'")
    expect(tree).toContain("'/observe/projects/$projectId/trends'")
    expect(tree).toContain("'/observe/projects/$projectId/issues'")
    expect(tree).toContain("'/observe/projects/$projectId/issues/$issueId'")
    expect(tree).toContain("'/observe/projects/$projectId/alerts'")
    expect(tree).toContain("'/observe/projects/$projectId/releases'")
    expect(tree).toContain("'/api/$sentryId/envelope'")
    expect(tree).toContain("'/api/$sentryId/store'")
    expect(tree).toContain("'/api/$sentryId/otlp/$'")
  })

  it("observe home redirects to a project when available", () => {
    const src = readFileSync(
      path.join(root, "routes/observe/index.tsx"),
      "utf8",
    )
    expect(src).toContain('createFileRoute("/observe/")')
    expect(src).toContain("client.observe.status")
    expect(src).toContain("uiMode=\"observe\"")
    expect(src).toContain("/observe/projects/$projectId")
    expect(src).toContain("DEPLOW_OBSERVE_ENABLED")
  })

  it("setup route redirects into project overview", () => {
    const src = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.setup.tsx"),
      "utf8",
    )
    expect(src).toContain("beforeLoad")
    expect(src).toContain('to: "/observe/projects/$projectId"')
  })

  it("onboarding is embedded on Overview when empty, not on every page", () => {
    const shell = readFileSync(
      path.join(root, "components/observe/project-shell.tsx"),
      "utf8",
    )
    const overview = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.index.tsx"),
      "utf8",
    )
    const layout = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.tsx"),
      "utf8",
    )
    const onboarding = readFileSync(
      path.join(root, "components/observe/onboarding.tsx"),
      "utf8",
    )
    expect(shell).not.toContain("needsOnboarding")
    expect(shell).not.toContain("ObserveOnboarding")
    expect(layout).toContain("Outlet")
    expect(overview).toContain("ObserveOnboarding")
    expect(onboarding).toContain("SENTRY_DSN")
    expect(onboarding).toContain("OTEL endpoint")
  })

  it("issues list enables project and supports bulk + tabs", () => {
    const src = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.issues.tsx"),
      "utf8",
    )
    expect(src).toContain("client.observe.projects.enable")
    expect(src).toContain("bulkUpdateStatus")
    expect(src).toContain("client.observe.issues")
  })

  it("issue detail links traces/logs and why-grouped", () => {
    const src = readFileSync(
      path.join(
        root,
        "routes/observe/projects/$projectId.issues_.$issueId.tsx",
      ),
      "utf8",
    )
    expect(src).toContain("Stacktrace")
    expect(src).toContain("Breadcrumbs")
    expect(src).toContain("Why grouped")
    expect(src).toContain("Open trace")
    expect(src).toContain("Correlated logs")
    expect(src).toContain("StackFramesView")
  })

  it("app-shell observe mode has project switcher and no Setup nav", () => {
    const src = readFileSync(
      path.join(root, "components/app-shell.tsx"),
      "utf8",
    )
    expect(src).toContain("Deploy")
    expect(src).toContain("Observe")
    expect(src).toContain('to="/observe"')
    expect(src).toContain("buildObserveNav")
    expect(src).toContain("ObserveProjectSwitcher")
    expect(src).not.toContain("/setup")
    expect(src).toContain('title: "Issues"')
    expect(src).toContain('title: "Traces"')
    expect(src).toContain('title: "Charts"')
    expect(src).not.toContain('title: "Dashboards"')
    expect(src).not.toContain('title: "Insights"')
    expect(src).not.toContain('title: "Alerts"')
  })

  it("oRPC observe namespace includes query surfaces", () => {
    const src = readFileSync(path.join(root, "orpc/router.ts"), "utf8")
    expect(src).toContain("observe:")
    expect(src).toContain("observe.status")
    expect(src).toContain("observe.issuesList")
    expect(src).toContain("observeQuery.servicesList")
    expect(src).toContain("observeQuery.exploreHeatmap")
    expect(src).toContain("observeQuery.alertsCreate")
    expect(src).toContain("observeQuery.insightsRun")
    expect(src).toContain("observeQuery.trendsRun")
    expect(src).toContain("observeQuery.fieldsSuggest")
    expect(src).toContain("observeQuery.dashboardsUpdate")
    expect(src).toContain("messageChannels")
  })

  it("Context URL module exists", () => {
    const src = readFileSync(
      path.join(root, "lib/observe/context/url.ts"),
      "utf8",
    )
    expect(src).toContain("serializeContext")
    expect(src).toContain("parseContext")
  })
})
