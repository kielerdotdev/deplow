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
    expect(src).toContain("shell.observeEnabled")
    expect(src).toContain('uiMode="observe"')
    expect(src).toContain("/observe/projects/$projectId")
    expect(src).toContain("DEPLOW_OBSERVE_ENABLED")
  })

  it("observe project layout owns AppShell so tabs do not remount chrome", () => {
    const layout = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.tsx"),
      "utf8",
    )
    const shell = readFileSync(
      path.join(root, "components/observe/project-shell.tsx"),
      "utf8",
    )
    expect(layout).toContain("AppShell")
    expect(layout).toContain("Outlet")
    expect(layout).toContain("ShellPending")
    expect(shell).not.toContain('from "@/components/app-shell"')
    expect(shell).toContain("PageHeader")
    expect(shell).toContain("ContextBar")
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
    expect(overview).toContain("StatStrip")
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

  it("issue detail has event graph, inspector, and correlation", () => {
    const src = readFileSync(
      path.join(
        root,
        "routes/observe/projects/$projectId.issues_.$issueId.tsx",
      ),
      "utf8",
    )
    expect(src).toContain("EventInspector")
    expect(src).toContain("VisualizationCanvas")
    expect(src).toContain("Recommended")
    expect(src).toContain("lifetime events")
    expect(src).toContain("serializeIssueSearch")
  })

  it("traces list uses shared context bar facets", () => {
    const traces = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.traces.tsx"),
      "utf8",
    )
    const shell = readFileSync(
      path.join(root, "components/observe/project-shell.tsx"),
      "utf8",
    )
    const bar = readFileSync(
      path.join(root, "components/observe/context-bar.tsx"),
      "utf8",
    )
    expect(traces).toContain("Trace volume")
    expect(traces).toContain("ObserveProjectShell")
    expect(traces).not.toContain("Hello")
    expect(traces).not.toContain("RouteComponent")
    expect(shell).toContain("surfaceFromPath")
    expect(shell).toContain("surface={surface}")
    expect(bar).toContain("ObserveFacets")
    expect(bar).toContain("QueryInput")
    expect(bar).toContain("FilterBuilder")
    expect(bar).toContain('surface === "traces"')
  })

  it("trace detail embeds logs and span URL selection", () => {
    const src = readFileSync(
      path.join(
        root,
        "routes/observe/projects/$projectId.traces_.$traceId.tsx",
      ),
      "utf8",
    )
    expect(src).toContain("Logs & errors")
    expect(src).toContain("serializeTraceSearch")
    expect(src).toContain("Jump to error")
    expect(src).toContain("AttributeInspector")
  })

  it("app-shell observe mode has project switcher and no Setup nav", () => {
    const src = readFileSync(
      path.join(root, "components/app-shell.tsx"),
      "utf8",
    )
    expect(src).toContain("Deploy")
    expect(src).toContain("Observe")
    expect(src).toContain("observeHome")
    expect(src).toContain("buildObserveNav")
    expect(src).toContain("ProjectSwitcher")
    expect(src).toContain("useProjectStore")
    expect(src).not.toContain("/setup")
    expect(src).toContain('title: "Issues"')
    expect(src).toContain('title: "Traces"')
    expect(src).toContain('title: "Charts"')
    expect(src).toContain('title: "Alerts"')
    expect(src).toContain('title: "Saved charts"')
    expect(src).toContain('title: "Boards"')
  })

  it("Charts analysis tabs do not link to other Observe pages", () => {
    const src = readFileSync(
      path.join(root, "components/observe/trends/analysis-type-tabs.tsx"),
      "utf8",
    )
    expect(src).toContain('"trends"')
    expect(src).toContain('"compare"')
    expect(src).toContain('"distributions"')
    expect(src).not.toContain('kind: "link"')
    expect(src).not.toContain("/explore")
    expect(src).not.toContain("/traces")
    expect(src).not.toContain("/logs")
    expect(src).not.toContain("errors")
  })

  it("alerts route lists and manages alerts instead of redirecting", () => {
    const src = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.alerts.tsx"),
      "utf8",
    )
    expect(src).toContain("CreateAlertDialog")
    expect(src).toContain("alerts.delete")
    expect(src).toContain("ConfirmActionDialog")
    expect(src).not.toContain('to: "/observe/projects/$projectId/trends"')
  })

  it("oRPC observe namespace includes query surfaces", () => {
    const src = readFileSync(path.join(root, "orpc/router.ts"), "utf8")
    expect(src).toContain("observe:")
    expect(src).toContain("observe.status")
    expect(src).toContain("observe.issuesList")
    expect(src).toContain("observe.issuesTrend")
    expect(src).toContain("observeQuery.tracesHistogramQuery")
    expect(src).toContain("observeQuery.servicesList")
    expect(src).toContain("observeQuery.exploreHeatmap")
    expect(src).toContain("observeQuery.alertsCreate")
    expect(src).toContain("observeQuery.alertsDelete")
    expect(src).toContain("observeQuery.savedViewsDelete")
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
