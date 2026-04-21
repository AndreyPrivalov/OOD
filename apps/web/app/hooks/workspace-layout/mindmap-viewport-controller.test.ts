import { describe, expect, it } from "vitest"
import {
  buildContentBounds,
  buildContextBounds,
  buildNodeRect,
  clampViewportToBounds,
  computeAutoFrameViewport,
} from "./mindmap-viewport-controller"

describe("mindmap viewport controller helpers", () => {
  it("builds node and content bounds", () => {
    const first = buildNodeRect({
      id: "a",
      x: 10,
      y: 20,
      width: 50,
      height: 30,
    })
    const bounds = buildContentBounds([
      { id: "a", x: 10, y: 20, width: 50, height: 30 },
      { id: "b", x: 100, y: 90, width: 20, height: 20 },
    ])

    expect(first).toEqual({ minX: 10, minY: 20, maxX: 60, maxY: 50 })
    expect(bounds).toEqual({ minX: 10, minY: 20, maxX: 120, maxY: 110 })
  })

  it("clamps viewport to keep content inside frame bounds", () => {
    const clamped = clampViewportToBounds({
      viewport: { x: 400, y: 350, zoom: 3.4 },
      frameSize: { width: 320, height: 240 },
      contentBounds: { minX: 0, minY: 0, maxX: 200, maxY: 140 },
      minZoom: 0.5,
      maxZoom: 2,
      padding: 16,
    })

    expect(clamped.zoom).toBe(2)
    expect(clamped.x).toBeLessThanOrEqual(16)
    expect(clamped.y).toBeLessThanOrEqual(16)
  })

  it("computes context bounds by editing node ids", () => {
    const byId = new Map([
      ["a", { minX: 0, minY: 0, maxX: 100, maxY: 50 }],
      ["b", { minX: 120, minY: 40, maxX: 220, maxY: 90 }],
    ])
    const context = buildContextBounds(byId, ["b", "a"])

    expect(context).toEqual({
      minX: 0,
      minY: 0,
      maxX: 220,
      maxY: 90,
    })
  })

  it("ignores unknown ids while computing context bounds", () => {
    const byId = new Map([
      ["a", { minX: 10, minY: 20, maxX: 50, maxY: 70 }],
      ["b", { minX: 80, minY: 30, maxX: 120, maxY: 90 }],
    ])
    const context = buildContextBounds(byId, ["missing", "b"])

    expect(context).toEqual({
      minX: 80,
      minY: 30,
      maxX: 120,
      maxY: 90,
    })
  })

  it("computes auto-frame viewport without increasing user zoom", () => {
    const next = computeAutoFrameViewport({
      viewport: { x: 0, y: 0, zoom: 1.4 },
      frameSize: { width: 400, height: 240 },
      contextBounds: { minX: 0, minY: 0, maxX: 500, maxY: 180 },
      contentBounds: { minX: -40, minY: 0, maxX: 700, maxY: 300 },
      minZoom: 0.4,
      maxZoom: 2.2,
      padding: 24,
    })

    expect(next.zoom).toBeLessThanOrEqual(1.4)
    expect(Number.isFinite(next.x)).toBe(true)
    expect(Number.isFinite(next.y)).toBe(true)
  })

  it("centers content when it is smaller than the frame", () => {
    const next = clampViewportToBounds({
      viewport: { x: -999, y: 999, zoom: 1 },
      frameSize: { width: 400, height: 300 },
      contentBounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
      minZoom: 0.4,
      maxZoom: 2.2,
      padding: 24,
    })

    expect(next.x).toBe(150)
    expect(next.y).toBe(125)
    expect(next.zoom).toBe(1)
  })

  it("keeps viewport unchanged when auto-frame runs with zero frame size", () => {
    const current = { x: 12, y: 18, zoom: 0.9 }
    const next = computeAutoFrameViewport({
      viewport: current,
      frameSize: { width: 0, height: 0 },
      contextBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      contentBounds: { minX: 0, minY: 0, maxX: 300, maxY: 300 },
      minZoom: 0.4,
      maxZoom: 2.2,
      padding: 24,
    })

    expect(next).toBe(current)
  })
})
