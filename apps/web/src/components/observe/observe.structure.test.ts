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
    expect(tree).not.toContain("'/observe/projects/$projectId/explore'")
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
    expect(src).toContain("HOSTRIG_OBSERVE_ENABLED")
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
    expect(layout).toContain("GlobalObserveShortcuts")
    expect(shell).not.toContain('from "@/components/app-shell"')
    expect(shell).toContain("ObservePageHeader")
    expect(shell).toContain("ContextBar")
  })

  it("explorer pages use ObservePageLayout filter sidebar", () => {
    const traces = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.traces.tsx"),
      "utf8",
    )
    const logs = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.logs.tsx"),
      "utf8",
    )
    expect(traces).toContain("ObservePageLayout")
    expect(traces).toContain("ExplorerFacetPanel")
    expect(logs).toContain("ObservePageLayout")
    expect(logs).toContain("ExplorerFacetPanel")
    const facet = readFileSync(
      path.join(root, "components/observe/explorer/facet-panel.tsx"),
      "utf8",
    )
    expect(facet).toContain("FilterSidebarHeader")
    expect(facet).toContain("FilterSection")
  })

  it("context bar wires advanced filter and time hotkey", () => {
    const bar = readFileSync(
      path.join(root, "components/observe/context-bar.tsx"),
      "utf8",
    )
    expect(bar).toContain("AdvancedFilterDialog")
    expect(bar).toContain("hotkey")
    expect(bar).toContain("shortcutFocus")
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
    expect(overview).toContain("SetupChecklist")
    expect(onboarding).toContain("SENTRY_DSN")
    expect(onboarding).toContain("OTEL endpoint")
    expect(onboarding).toContain("observe-onboarding")
    expect(onboarding).toContain("onboarding-method-tabs")
    expect(onboarding).toContain("onboarding-verification")
    expect(onboarding).not.toContain("justify-center")
    expect(onboarding).toContain("CopyableField")
    expect(onboarding).toContain("CodeSnippet")
  })

  it("issues list enables project and supports bulk + tabs", () => {
    const src = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.issues.tsx"),
      "utf8",
    )
    expect(src).toContain("client.observe.projects.enable")
    expect(src).toContain("bulkUpdateStatus")
    expect(src).toContain("client.observe.issues")
    expect(src).toContain("IssuesToolbar")
    expect(src).toContain("IssuesFilterSidebar")
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
    expect(src).toContain("IssueHero")
    expect(src).toContain("Copy as prompt")
  })

  it("overview shows setup checklist and first-signal celebration", () => {
    const overview = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.index.tsx"),
      "utf8",
    )
    expect(overview).toContain("SetupChecklist")
    expect(overview).toContain("FirstSignalCelebration")
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
    expect(traces).toContain("ExplorerViewTabs")
    expect(traces).toContain("ExplorerFacetPanel")
    expect(traces).toContain("ExplorerExpressionInput")
    expect(traces).toContain("ExplorerFormulaBar")
    expect(traces).toContain("ExplorerTraceMatchPanel")
    expect(traces).toContain("serializeTelemetryQuery")
    expect(traces).not.toContain("Hello")
    expect(traces).not.toContain("RouteComponent")
    expect(shell).toContain("surfaceFromPath")
    expect(shell).toContain("surface={surface}")
    expect(bar).toContain("ObserveFacets")
    expect(bar).toContain("QueryInput")
    expect(bar).toContain("FilterBuilder")
    expect(bar).toContain('surface === "traces"')
  })

  it("observe query router exposes unified TelemetryQuery APIs", () => {
    const router = readFileSync(path.join(root, "orpc/router.ts"), "utf8")
    expect(router).toContain("queryRun")
    expect(router).toContain("queryFacets")
    expect(router).toContain("metricsCatalog")
    expect(router).toContain("alertsHistory")
    expect(router).toContain("alertsEvaluateNow")
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
    expect(src).toContain('title: "Monitor"')
    // Charts / Boards / Alerts are Monitor sub-tabs, not top-level peers.
    expect(src).not.toContain('title: "Saved charts"')
    expect(src).not.toContain('title: "Boards"')
    expect(src).not.toContain('title: "Alerts"')
    expect(src).not.toContain('to: `${base}/trends`')
  })

  it("Monitor sub-nav covers charts, boards, alerts", () => {
    const nav = readFileSync(
      path.join(root, "components/observe/monitor-sub-nav.tsx"),
      "utf8",
    )
    expect(nav).toContain("Charts")
    expect(nav).toContain("Boards")
    expect(nav).toContain("Alerts")
    expect(nav).toContain("/insights")
    expect(nav).toContain("/dashboards")
    expect(nav).toContain("/alerts")
    const shell = readFileSync(
      path.join(root, "components/observe/project-shell.tsx"),
      "utf8",
    )
    expect(shell).toContain("MonitorSubNav")
  })

  it("Charts list owns create dialog; trends redirects there", () => {
    const insights = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.insights.tsx"),
      "utf8",
    )
    expect(insights).toContain("ChartBuilderDialog")
    expect(insights).toContain("Create chart")
    expect(insights).toContain("ResourceTable")
    const boards = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.dashboards.tsx"),
      "utf8",
    )
    expect(boards).toContain("CreateBoardDialog")
    const trends = readFileSync(
      path.join(root, "routes/observe/projects/$projectId.trends.tsx"),
      "utf8",
    )
    expect(trends).toContain("redirect")
    expect(trends).toContain("/insights")
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
