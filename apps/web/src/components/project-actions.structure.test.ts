import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("Project context menu", () => {
  const menu = readFileSync(
    path.resolve(import.meta.dirname, "project-context-menu.tsx"),
    "utf8",
  )
  const dashboard = readFileSync(
    path.resolve(import.meta.dirname, "dashboard-card.tsx"),
    "utf8",
  )
  const home = readFileSync(
    path.resolve(import.meta.dirname, "../routes/index.tsx"),
    "utf8",
  )

  it("exposes open, settings, and destroy actions", () => {
    expect(menu).toContain("ContextMenu")
    expect(menu).toContain("ContextMenuTrigger")
    expect(menu).toContain("ContextMenuContent")
    expect(menu).toContain("Open")
    expect(menu).toContain("Settings")
    expect(menu).toContain("Destroy project")
    expect(menu).toContain('"/projects/$projectId/settings"')
    expect(menu).not.toContain('section: "settings"')
  })

  it("wraps home dashboard project rows in a context menu", () => {
    expect(home).toContain("ProjectContextMenu")
    expect(home).toContain("ProjectDeleteDialog")
    expect(home).toContain("client.projects.destroy")
    expect(home).toContain("projectMenu={projectMenuProps(project)}")
    expect(home).toContain("<TableRow className=\"data-table-row group\" />")
  })

  it("adds context menu to recent project sidebar rows", () => {
    expect(dashboard).toContain("ProjectContextMenu")
    expect(dashboard).toContain("projectMenu")
  })
})

describe("Project delete dialog", () => {
  const dialog = readFileSync(
    path.resolve(import.meta.dirname, "project-delete-dialog.tsx"),
    "utf8",
  )
  const home = readFileSync(
    path.resolve(import.meta.dirname, "../routes/index.tsx"),
    "utf8",
  )

  it("uses hold-to-confirm for destructive destroy", () => {
    expect(dialog).toContain("ConfirmationButton")
    expect(dialog).toContain("Hold to destroy")
    expect(dialog).toContain("data containers")
  })

  it("invalidates the dashboard after destroy", () => {
    expect(home).toContain("router.invalidate()")
    expect(home).toContain("onConfirm={handleDestroyProject}")
  })
})
