import { describe, expect, it } from "vitest"
import {
  applyMeasuredRowAnchor,
  parseRowIdFromTextareaKey,
  removeRowAnchor,
} from "./row-measurement-layer"

describe("row measurement layer", () => {
  it("parses row id from textarea key", () => {
    expect(parseRowIdFromTextareaKey("currentProblems:row-1")).toBe("row-1")
    expect(parseRowIdFromTextareaKey("invalid")).toBeNull()
  })

  it("removes row anchor immutably", () => {
    const current = {
      "row-1": { top: 10, bottom: 30 },
      "row-2": { top: 30, bottom: 50 },
    }

    const next = removeRowAnchor(current, "row-1")

    expect(next).toEqual({
      "row-2": { top: 30, bottom: 50 },
    })
    expect(current).toEqual({
      "row-1": { top: 10, bottom: 30 },
      "row-2": { top: 30, bottom: 50 },
    })
  })

  it("updates changed row and shifts following anchors by bottom delta", () => {
    const current = {
      "row-1": { top: 10, bottom: 30 },
      "row-2": { top: 30, bottom: 50 },
      "row-3": { top: 50, bottom: 70 },
    }
    const rowOrder = ["row-1", "row-2", "row-3"]

    const next = applyMeasuredRowAnchor(current, rowOrder, "row-2", {
      top: 30,
      bottom: 60,
    })

    expect(next).toEqual({
      "row-1": { top: 10, bottom: 30 },
      "row-2": { top: 30, bottom: 60 },
      "row-3": { top: 60, bottom: 80 },
    })
  })
})
