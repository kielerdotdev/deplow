import { describe, expect, it } from "vitest"

import {
  imageRetainCount,
  selectRollbackTarget,
} from "./image-retain"

describe("imageRetainCount", () => {
  it("defaults to 5", () => {
    const prev = process.env.DEPLOW_IMAGE_RETAIN
    delete process.env.DEPLOW_IMAGE_RETAIN
    expect(imageRetainCount()).toBe(5)
    if (prev === undefined) delete process.env.DEPLOW_IMAGE_RETAIN
    else process.env.DEPLOW_IMAGE_RETAIN = prev
  })

  it("reads DEPLOW_IMAGE_RETAIN", () => {
    const prev = process.env.DEPLOW_IMAGE_RETAIN
    process.env.DEPLOW_IMAGE_RETAIN = "3"
    expect(imageRetainCount()).toBe(3)
    if (prev === undefined) delete process.env.DEPLOW_IMAGE_RETAIN
    else process.env.DEPLOW_IMAGE_RETAIN = prev
  })
})

describe("selectRollbackTarget", () => {
  const rows = [
    {
      id: "d-new",
      image: "deplow/demo:new",
      status: "running",
      nodeId: "n1",
    },
    {
      id: "d-old",
      image: "deplow/demo:old",
      status: "stopped",
      nodeId: "n1",
    },
    {
      id: "d-fail",
      image: "deplow/demo:fail",
      status: "failed",
      nodeId: "n1",
    },
  ]

  it("picks prior stopped success by default", () => {
    const target = selectRollbackTarget(rows, {
      currentImage: "deplow/demo:new",
    })
    expect(target?.id).toBe("d-old")
    expect(target?.image).toBe("deplow/demo:old")
  })

  it("honors explicit deploymentId", () => {
    const target = selectRollbackTarget(rows, {
      deploymentId: "d-old",
      currentImage: "deplow/demo:new",
    })
    expect(target?.id).toBe("d-old")
  })

  it("rejects failed-only targets without image eligibility", () => {
    const target = selectRollbackTarget(rows, {
      deploymentId: "d-fail",
      currentImage: "deplow/demo:new",
    })
    expect(target).toBeNull()
  })
})
