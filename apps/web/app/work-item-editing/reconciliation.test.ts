import { describe, expect, it } from "vitest"
import {
  buildRowPatchFromServer,
  isServerPatchEchoingPayload,
  shouldApplyConfirmedTreePatch,
} from "./reconciliation"

describe("buildRowPatchFromServer", () => {
  it("keeps only supported server fields and sanitizes string lists", () => {
    const patch = buildRowPatchFromServer({
      id: "server-row-1",
      title: "Next title",
      object: null,
      possiblyRemovable: true,
      overcomplication: 4,
      blocksMoney: null,
      currentProblems: ["a", 1, "b"] as unknown as string[],
      solutionVariants: ["x", false, "y"] as unknown as string[],
    })

    expect(patch).toEqual({
      id: "server-row-1",
      title: "Next title",
      object: null,
      possiblyRemovable: true,
      overcomplication: 4,
      blocksMoney: null,
      currentProblems: ["a", "b"],
      solutionVariants: ["x", "y"],
    })
  })

  it("keeps canonical metric maps from server payload", () => {
    const patch = buildRowPatchFromServer({
      metricValues: { "m-1": "direct", "m-2": "indirect" },
      metricAggregates: { "m-1": "direct", "m-2": "none" },
    })

    expect(patch).toEqual({
      metricValues: { "m-1": "direct", "m-2": "indirect" },
      metricAggregates: { "m-1": "direct", "m-2": "none" },
    })
  })
})

describe("isServerPatchEchoingPayload", () => {
  it("detects echoed primitive and list values", () => {
    const patch = {
      title: "Hello",
      currentProblems: ["a", "b"],
    }
    const payload = {
      title: "Hello",
      currentProblems: ["a", "b"],
    }
    expect(isServerPatchEchoingPayload(patch, payload)).toBe(true)
  })

  it("returns false for empty patches and mismatched values", () => {
    expect(isServerPatchEchoingPayload({}, { title: "x" })).toBe(false)
    expect(
      isServerPatchEchoingPayload(
        { solutionVariants: ["a", "b"] },
        { solutionVariants: ["a"] },
      ),
    ).toBe(false)
  })
})

describe("shouldApplyConfirmedTreePatch", () => {
  it("keeps applying confirmed rating patches even when server echoes payload", () => {
    const patch = buildRowPatchFromServer({ overcomplication: 4 })

    expect(shouldApplyConfirmedTreePatch(patch, { overcomplication: 4 })).toBe(
      true,
    )
  })

  it("skips echo patches for non-rating fields", () => {
    const patch = buildRowPatchFromServer({ title: "Updated" })

    expect(shouldApplyConfirmedTreePatch(patch, { title: "Updated" })).toBe(
      false,
    )
  })
})
