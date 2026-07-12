import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("ConfirmationButton", () => {
  const src = readFileSync(
    path.resolve(import.meta.dirname, "confirmation-button.tsx"),
    "utf8",
  )

  it("requires holding before firing onConfirm", () => {
    expect(src).toContain("holdDurationMs")
    expect(src).toContain("requestAnimationFrame")
    expect(src).toContain("onPointerUp")
    expect(src).toContain("onPointerLeave")
    expect(src).toContain("onConfirm()")
    expect(src).toContain('aria-pressed={holding}')
  })

  it("supports keyboard hold via space and enter", () => {
    expect(src).toContain('event.key !== " "')
    expect(src).toContain('event.key !== "Enter"')
    expect(src).toContain("onKeyDown")
    expect(src).toContain("onKeyUp")
  })
})

describe("Project topology context menu", () => {
  const src = readFileSync(
    path.resolve(import.meta.dirname, "project-topology.tsx"),
    "utf8",
  )

  it("wraps service nodes in a context menu with actions", () => {
    expect(src).toContain("ContextMenu")
    expect(src).toContain("ContextMenuTrigger")
    expect(src).toContain("ContextMenuContent")
    expect(src).toContain("Delete service")
    expect(src).toContain("onDelete")
    expect(src).toContain("Deploy")
    expect(src).toContain("Logs")
    expect(src).toContain("Open")
  })

  it("does not attach context menu to empty states", () => {
    expect(src).toContain("topology-empty")
    expect(src).not.toMatch(/topology-empty[\s\S]*ContextMenu/)
  })
})

describe("Service delete dialog", () => {
  const dialog = readFileSync(
    path.resolve(import.meta.dirname, "service-delete-dialog.tsx"),
    "utf8",
  )
  const projectPage = readFileSync(
    path.resolve(import.meta.dirname, "../routes/projects/$projectId.tsx"),
    "utf8",
  )

  it("uses hold-to-confirm for destructive delete", () => {
    expect(dialog).toContain("ConfirmationButton")
    expect(dialog).toContain("Hold to delete")
  })

  it("calls services.destroy from the project page", () => {
    expect(projectPage).toContain("ServiceDeleteDialog")
    expect(projectPage).toContain("client.services.destroy")
    expect(projectPage).toContain("onDelete={(serviceId) => setDeleteServiceId(serviceId)}")
  })
})
