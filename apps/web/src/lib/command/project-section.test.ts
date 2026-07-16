import { describe, expect, it } from "vitest"

import {
  isProjectSection,
  parseProjectSection,
  PROJECT_SECTION_IDS,
  projectSectionFromPath,
  projectSectionSearch,
} from "./project-section"

describe("parseProjectSection", () => {
  it("accepts every known section id", () => {
    for (const id of PROJECT_SECTION_IDS) {
      expect(parseProjectSection(id)).toBe(id)
      expect(isProjectSection(id)).toBe(true)
    }
  })

  it("falls back to overview for unknown values", () => {
    expect(parseProjectSection(undefined)).toBe("overview")
    expect(parseProjectSection(null)).toBe("overview")
    expect(parseProjectSection("")).toBe("overview")
    expect(parseProjectSection("nope")).toBe("overview")
    expect(parseProjectSection(1)).toBe("overview")
    expect(isProjectSection("nope")).toBe(false)
  })

  it("builds search objects for navigation", () => {
    expect(projectSectionSearch("settings")).toEqual({ section: "settings" })
  })

  it("derives section from pathname", () => {
    expect(projectSectionFromPath("/projects/abc")).toBe("overview")
    expect(projectSectionFromPath("/projects/abc/deployments")).toBe(
      "deployments",
    )
    expect(projectSectionFromPath("/projects/abc/secrets")).toBe("secrets")
    expect(projectSectionFromPath("/projects/abc/settings")).toBe("settings")
    expect(projectSectionFromPath("/settings")).toBe(null)
  })
})
