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
  })

  it("project detail uses Tabs segments for secrets, deploy, backups", () => {
    const src = readFileSync(
      path.join(root, "routes/projects/$projectId.tsx"),
      "utf8",
    )
    expect(src).toContain('from "@/components/ui/tabs"')
    expect(src).toContain('value="secrets"')
    expect(src).toContain('value="deploy"')
    expect(src).toContain('value="backups"')
    expect(src).toContain("TabsTrigger")
    expect(src).toContain("TabsContent")
  })

  it("login uses Card + Input + Label primitives", () => {
    const src = readFileSync(path.join(root, "routes/login.tsx"), "utf8")
    expect(src).toContain('from "@/components/ui/card"')
    expect(src).toContain('from "@/components/ui/input"')
    expect(src).toContain('from "@/components/ui/label"')
  })
})
